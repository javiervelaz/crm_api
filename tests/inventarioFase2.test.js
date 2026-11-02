/**
 * inventarioFase2.test.js — recetas, descuento al vender y reversa al borrar.
 */
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const sinon = require('sinon');
const jwt = require('jsonwebtoken');

const app = require('../node');
const pool = require('../pool');
const { runWith } = require('../tenantContext');
const db = require('../model/inventario/db');
const pedidoDb = require('../model/pedido/db');
const planService = require('../services/cliente/planService');
const ventaStock = require('../services/inventario/ventaStockService');
const recetaService = require('../services/inventario/recetaService');
const pedidoService = require('../services/pedido/pedidoService');
const operaciones = require('../services/operaciones_diarias/operacionesDiariasService');

let expect;
before(async () => { ({ expect } = await import('chai')); });
afterEach(() => sinon.restore());

const C = 77;
const U = 5;
const esperarError = async (p) => { try { await p; } catch (e) { return e; } throw new Error('se esperaba un error'); };
const conPlan = (features, isExpired = false) =>
  sinon.stub(planService, 'getClienteTierAndFeatures').resolves({ features, tierCode: 'PREMIUM', isExpired });

// Pizza muzza: 0,25 kg de mozzarella y 0,3 kg de masa. Gaseosa: 1 u.
const RECETAS = [
  { producto_id: 1, stock_item_id: 10, cantidad_por_unidad: '0.25', nombre: 'Mozzarella', unidad: 'kg', stock_minimo: '5' },
  { producto_id: 1, stock_item_id: 11, cantidad_por_unidad: '0.3', nombre: 'Masa', unidad: 'kg', stock_minimo: null },
  { producto_id: 2, stock_item_id: 12, cantidad_por_unidad: '1', nombre: 'Gaseosa', unidad: 'u', stock_minimo: '6' },
  { producto_id: 3, stock_item_id: 10, cantidad_por_unidad: '0.2', nombre: 'Mozzarella', unidad: 'kg', stock_minimo: '5' },
];

describe('Inventario F2 — consumo', () => {
  const { calcularConsumo, unidadesDeLinea } = ventaStock._interno;

  it('la mitad cuenta 0,5', () => {
    expect(unidadesDeLinea({ cantidad: 2, cantidad_mitad: 1 })).to.equal(2.5);
    expect(unidadesDeLinea({ cantidad: 0, cantidad_mitad: 1 })).to.equal(0.5);
    expect(unidadesDeLinea({ cantidad: 3 })).to.equal(3);
  });

  it('suma por ítem entre productos e ignora los que no tienen receta', () => {
    const c = calcularConsumo(
      [
        { producto_id: 1, cantidad: 2, cantidad_mitad: 1 }, // 2,5 muzzas
        { producto_id: 3, cantidad: 1, cantidad_mitad: 0 }, // otra pizza con 0,2 de muzza
        { producto_id: 2, cantidad: 3, cantidad_mitad: 0 },
        { producto_id: 99, cantidad: 5, cantidad_mitad: 0 },
      ],
      RECETAS
    );
    const por = Object.fromEntries(c.map((x) => [x.stock_item_id, x.cantidad]));
    expect(por).to.deep.equal({ 10: 0.825, 11: 0.75, 12: 3 });
  });
});

describe('Inventario F2 — descuento al vender', () => {
  let insert;
  beforeEach(() => {
    sinon.stub(db, 'tenantUsaInventario').resolves(true);
    sinon.stub(db, 'getNetoVentaPorPedido').resolves([]);
    sinon.stub(db, 'getRecetasPorProductos').resolves(RECETAS);
    sinon.stub(db, 'getStocks').resolves(new Map([[10, 5.5], [11, 2], [12, 10]]));
    insert = sinon.stub(db, 'insertMovimiento').resolves({ id: 1 });
  });

  const PEDIDO = { pedido_id: 50, usuario_id: U, comanda_nro: 12, lineas: [{ producto_id: 1, cantidad: 2, cantidad_mitad: 1 }, { producto_id: 2, cantidad: 1 }] };

  it('asienta una venta negativa por ítem, enlazada al pedido', async () => {
    conPlan({ canUseInventario: true });
    await ventaStock.descontarPorPedido(C, PEDIDO);
    const movs = insert.getCalls().map((c) => c.args[1]);
    expect(movs).to.have.length(3);
    expect(movs.find((m) => m.stock_item_id === 10)).to.include({ tipo: 'venta', cantidad: -0.625, pedido_id: 50, usuario_id: U, nota: 'Pedido #12' });
    expect(insert.getCalls().every((c) => c.args[0] === C)).to.equal(true);
  });

  it('devuelve los ítems que cruzaron el mínimo con esta venta', async () => {
    conPlan({ canUseInventario: true });
    const cruces = await ventaStock.descontarPorPedido(C, PEDIDO);
    // Mozzarella: 5,5 → 4,875 cruza el mínimo de 5. Gaseosa: 10 → 9, sigue sobre 6.
    expect(cruces.map((x) => x.stock_item_id)).to.deep.equal([10]);
  });

  it('plan sin inventario o vencido: no toca el stock', async () => {
    const plan = conPlan({ canUseInventario: false });
    await ventaStock.descontarPorPedido(C, PEDIDO);
    plan.resolves({ features: { canUseInventario: true }, tierCode: 'BASIC', isExpired: true });
    await ventaStock.descontarPorPedido(C, PEDIDO);
    expect(insert.called).to.equal(false);
  });

  it('comercio sin módulo inventario: ni consulta el plan', async () => {
    db.tenantUsaInventario.resolves(false);
    const plan = conPlan({ canUseInventario: true });
    await ventaStock.descontarPorPedido(C, PEDIDO);
    expect(plan.called).to.equal(false);
    expect(insert.called).to.equal(false);
  });

  it('idempotente: un pedido que ya descontó no vuelve a descontar', async () => {
    conPlan({ canUseInventario: true });
    db.getNetoVentaPorPedido.resolves([{ stock_item_id: 10, neto: -0.5 }]);
    await ventaStock.descontarPorPedido(C, PEDIDO);
    expect(insert.called).to.equal(false);
  });

  it('un error del stock no frena la venta y se revierte al savepoint', async () => {
    conPlan({ canUseInventario: true });
    insert.rejects(new Error('boom'));
    const q = sinon.stub(pool, 'query').resolves({ rows: [] });
    sinon.stub(console, 'error');
    const r = await runWith({ clienteId: C }, () => ventaStock.descontarPorPedido(C, PEDIDO));
    expect(r).to.equal(null);
    const sqls = q.getCalls().map((c) => c.args[0]);
    expect(sqls).to.deep.equal(['SAVEPOINT stock_venta', 'ROLLBACK TO SAVEPOINT stock_venta']);
  });

  it('crearPedido descuenta con las líneas, el usuario y la comanda del pedido', async () => {
    sinon.stub(pedidoDb, 'getComandaNro').resolves([{ count: '4' }]);
    sinon.stub(pedidoDb, 'createPedido').resolves(50);
    sinon.stub(pedidoDb, 'insertPedidoProducto').resolves();
    const desc = sinon.stub(ventaStock, 'descontarPorPedido').resolves([]);
    const lineas = [{ producto_id: 1, cantidad: 1, cantidad_mitad: 0 }];
    await operaciones.crearPedido({ registro_diario_id: 3, usuario_id: U, cliente_id: C, productos: lineas, cliente_telefono: 1 });
    expect(desc.firstCall.args).to.deep.equal([C, { pedido_id: 50, lineas, usuario_id: U, comanda_nro: 5 }]);
    expect(pedidoDb.insertPedidoProducto.calledBefore(desc)).to.equal(true);
  });
});

describe('Inventario F2 — reversa al borrar un pedido', () => {
  it('devuelve sólo lo neto descontado, como reversa_venta', async () => {
    sinon.stub(db, 'getNetoVentaPorPedido').resolves([
      { stock_item_id: 10, neto: -0.625 },
      { stock_item_id: 12, neto: 0 }, // ya revertido
    ]);
    const insert = sinon.stub(db, 'insertMovimiento').resolves({ id: 1 });
    const n = await ventaStock.revertirPedido(C, { pedido_id: 50, usuario_id: U, comanda_nro: 12 });
    expect(n).to.equal(1);
    expect(insert.firstCall.args[1]).to.include({ stock_item_id: 10, tipo: 'reversa_venta', cantidad: 0.625, pedido_id: 50, nota: 'Pedido #12 borrado' });
  });

  it('deletePedidoService: 404 si el pedido no es del comercio, y no revierte nada', async () => {
    sinon.stub(pedidoDb, 'getPedidoDelTenant').resolves(null);
    const rev = sinon.stub(ventaStock, 'revertirPedido');
    const del = sinon.stub(pedidoDb, 'deletePedido');
    const e = await esperarError(pedidoService.deletePedidoService(50, C, U));
    expect(e.status).to.equal(404);
    expect(rev.called).to.equal(false);
    expect(del.called).to.equal(false);
  });

  it('deletePedidoService: revierte el stock antes de borrar', async () => {
    sinon.stub(pedidoDb, 'getPedidoDelTenant').resolves({ id: 50, comanda_nro: 12, usuario_id: 9 });
    const rev = sinon.stub(ventaStock, 'revertirPedido').resolves(1);
    const del = sinon.stub(pedidoDb, 'deletePedido').resolves({ id: 50 });
    await pedidoService.deletePedidoService(50, C, U);
    expect(rev.firstCall.args).to.deep.equal([C, { pedido_id: 50, usuario_id: U, comanda_nro: 12 }]);
    expect(rev.calledBefore(del)).to.equal(true);
  });

  it('deletePedido: corre en la tx del request y no borra líneas de otro comercio', async () => {
    const connect = sinon.stub(pool, 'connect');
    const q = sinon.stub(pool, 'query').resolves({ rows: [{ id: 50 }] });
    await pedidoDb.deletePedido(50, C);
    expect(connect.called).to.equal(false);
    const [sqlLineas, params] = q.firstCall.args;
    expect(sqlLineas.replace(/\s+/g, ' ')).to.include('SELECT id FROM "pedido" WHERE id = $1 AND cliente_id = $2');
    expect(params).to.deep.equal([50, C]);
    expect(q.secondCall.args[0]).to.match(/DELETE FROM "pedido" WHERE id = \$1 AND cliente_id = \$2/);
  });
});

describe('Inventario F2 — recetas', () => {
  const ITEMS = [
    { id: 10, nombre: 'Mozzarella', tipo: 'insumo', unidad: 'kg', activo: true },
    { id: 12, nombre: 'Gaseosa', tipo: 'producto', unidad: 'u', activo: true },
  ];
  let replace;
  beforeEach(() => {
    sinon.stub(db, 'getProducto').resolves({ id: 1, nombre: 'Muzza' });
    sinon.stub(db, 'getItemsPorIds').callsFake(async (_c, ids) => ITEMS.filter((i) => ids.includes(i.id)));
    sinon.stub(db, 'getReceta').resolves([]);
    replace = sinon.stub(db, 'replaceReceta').resolves();
  });

  it('PREMIUM: guarda insumos y convierte g a kg', async () => {
    await recetaService.guardar(C, 1, { lineas: [{ stock_item_id: 10, cantidad: 250, unidad: 'g' }] }, { canUseRecetas: true });
    expect(replace.firstCall.args).to.deep.equal([C, 1, [{ stock_item_id: 10, cantidad_por_unidad: 0.25 }]]);
  });

  it('BASIC: rechaza una receta con insumos', async () => {
    const e = await esperarError(
      recetaService.guardar(C, 1, { lineas: [{ stock_item_id: 10, cantidad: 0.25 }] }, { canUseRecetas: false })
    );
    expect(e.status).to.equal(403);
    expect(e.code).to.equal('RECETAS_PLAN');
    expect(replace.called).to.equal(false);
  });

  it('BASIC: permite el vínculo 1:1 de un producto terminado', async () => {
    await recetaService.guardar(C, 1, { lineas: [{ stock_item_id: 12, cantidad: 1 }] }, { canUseRecetas: false });
    expect(replace.called).to.equal(true);
  });

  it('lista vacía quita la receta (en cualquier plan)', async () => {
    await recetaService.guardar(C, 1, { lineas: [] }, {});
    expect(replace.firstCall.args).to.deep.equal([C, 1, []]);
  });

  it('ingrediente repetido, inexistente o dado de baja', async () => {
    const f = { canUseRecetas: true };
    expect((await esperarError(recetaService.guardar(C, 1, { lineas: [{ stock_item_id: 10, cantidad: 1 }, { stock_item_id: 10, cantidad: 2 }] }, f))).status).to.equal(400);
    expect((await esperarError(recetaService.guardar(C, 1, { lineas: [{ stock_item_id: 99, cantidad: 1 }] }, f))).status).to.equal(404);
    db.getItemsPorIds.resolves([{ ...ITEMS[0], activo: false }]);
    expect((await esperarError(recetaService.guardar(C, 1, { lineas: [{ stock_item_id: 10, cantidad: 1 }] }, f))).status).to.equal(409);
  });

  it('producto de otro comercio: 404', async () => {
    db.getProducto.resolves(null);
    const e = await esperarError(recetaService.guardar(C, 1, { lineas: [] }, { canUseRecetas: true }));
    expect(e.status).to.equal(404);
  });

  it('replaceReceta inserta todo con el cliente_id del request', async () => {
    replace.restore();
    const q = sinon.stub(pool, 'query').resolves({ rows: [] });
    await db.replaceReceta(C, 1, [{ stock_item_id: 10, cantidad_por_unidad: 0.25 }]);
    expect(q.firstCall.args[1]).to.deep.equal([C, 1]);
    expect(q.secondCall.args[0]).to.match(/INSERT INTO receta \(cliente_id, producto_id, stock_item_id, cantidad_por_unidad\)/);
    expect(q.secondCall.args[1]).to.deep.equal([C, 1, [10], [0.25]]);
  });

  it('HTTP PUT /recetas/:id pasa las features del plan al service', async () => {
    conPlan({ canUseInventario: true, canUseRecetas: false });
    const svc = sinon.stub(recetaService, 'guardar').resolves({ ok: true });
    const token = jwt.sign(
      { userId: U, cliente_id: C, role: ['admin'], modules: ['inventario'], permissions: { inventario: ['inventario.update'] } },
      process.env.JWT_SECRET, { expiresIn: '1h' }
    );
    const res = await request(app).put('/api/inventario/recetas/1').set('Authorization', `Bearer ${token}`).send({ lineas: [] });
    expect(res.status).to.equal(200);
    expect(svc.firstCall.args.slice(0, 2)).to.deep.equal([C, 1]);
    expect(svc.firstCall.args[3]).to.include({ canUseRecetas: false });
  });
});

describe('Inventario F2 — migración 027', () => {
  const sql = fs.readFileSync(path.join(__dirname, '../migrations/027_receta.sql'), 'utf8');
  it('FKs compuestas por tenant y borrado en cascada desde el producto', () => {
    expect(sql).to.match(/FOREIGN KEY \(producto_id, cliente_id\)\s+REFERENCES producto \(id, cliente_id\) ON DELETE CASCADE/);
    expect(sql).to.match(/FOREIGN KEY \(stock_item_id, cliente_id\)\s+REFERENCES stock_item \(id, cliente_id\)/);
  });
  it('la purga borra receta antes que producto y stock_item', () => {
    const src = fs.readFileSync(path.join(__dirname, '../scripts/purgeClientes.js'), 'utf8');
    const pos = (t) => src.indexOf(`['${t}'`);
    expect(pos('receta')).to.be.greaterThan(-1);
    expect(pos('receta')).to.be.lessThan(pos('producto'));
    expect(pos('receta')).to.be.lessThan(pos('stock_item'));
  });
});
