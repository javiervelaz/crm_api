/**
 * inventario.test.js — Fase 1a: ítems, movimientos, compra→gasto, alertas.
 */
const request = require('supertest');
const sinon = require('sinon');
const jwt = require('jsonwebtoken');

const app = require('../node');
const pool = require('../pool');
const db = require('../model/inventario/db');
const salidaCajaDb = require('../model/salida_caja/db');
const planService = require('../services/cliente/planService');
const service = require('../services/inventario/inventarioService');

let expect;
before(async () => { ({ expect } = await import('chai')); });
afterEach(() => sinon.restore());

const CLIENTE = 77;
const USUARIO = 5;
const ITEM = { id: 3, nombre: 'Mozzarella', unidad: 'kg', activo: true };
const ITEM_SALDO = { id: 3, nombre: 'Mozzarella', tipo: 'insumo', unidad: 'kg', stock_minimo: '5', costo_unitario: null, activo: true, stock: '10' };

const esperarError = async (p) => { try { await p; } catch (e) { return e; } throw new Error('se esperaba un error'); };

// ─── Aislamiento por tenant ───────────────────────────────────────────────
describe('Inventario — model: toda query filtra por cliente_id', () => {
  const llamadas = {
    listItems: () => db.listItems(CLIENTE),
    getItem: () => db.getItem(CLIENTE, 3),
    lockItem: () => db.lockItem(CLIENTE, 3),
    getStock: () => db.getStock(CLIENTE, 3),
    createItem: () => db.createItem(CLIENTE, { nombre: 'x', tipo: 'insumo', unidad: 'u' }),
    updateItem: () => db.updateItem(CLIENTE, 3, { nombre: 'y' }),
    setCostoUnitario: () => db.setCostoUnitario(CLIENTE, 3, 10),
    insertMovimiento: () => db.insertMovimiento(CLIENTE, { stock_item_id: 3, tipo: 'compra', cantidad: 1, usuario_id: USUARIO }),
    listMovimientos: () => db.listMovimientos(CLIENTE),
    listAlertas: () => db.listAlertas(CLIENTE),
    getCajaAbiertaId: () => db.getCajaAbiertaId(CLIENTE),
    // Fase 2
    getProducto: () => db.getProducto(CLIENTE, 9),
    listProductosConReceta: () => db.listProductosConReceta(CLIENTE),
    getReceta: () => db.getReceta(CLIENTE, 9),
    getItemsPorIds: () => db.getItemsPorIds(CLIENTE, [3]),
    replaceReceta: () => db.replaceReceta(CLIENTE, 9, [{ stock_item_id: 3, cantidad_por_unidad: 0.2 }]),
    getRecetasPorProductos: () => db.getRecetasPorProductos(CLIENTE, [9]),
    getNetoVentaPorPedido: () => db.getNetoVentaPorPedido(CLIENTE, 50),
    getStocks: () => db.getStocks(CLIENTE, [3]),
    tenantUsaInventario: () => db.tenantUsaInventario(CLIENTE),
  };
  // Catálogo global, sin tenant
  const GLOBALES = ['getCategoriaTipoId'];

  it('cubre todas las funciones exportadas', () => {
    expect(Object.keys(db).sort()).to.deep.equal([...Object.keys(llamadas), ...GLOBALES].sort());
  });

  for (const [nombre, fn] of Object.entries(llamadas)) {
    it(nombre, async () => {
      const q = sinon.stub(pool, 'query').resolves({ rows: [{ id: 1, stock: '0' }], rowCount: 1 });
      await fn();
      const [sql, params] = q.firstCall.args;
      // SELECT/UPDATE: WHERE cliente_id = $1 · INSERT: primera columna cliente_id con $1
      const filtra = /\bcliente_id = \$1\b/.test(sql) || /^\s*INSERT INTO \w+\s*\(\s*cliente_id\b[\s\S]*VALUES \(\$1\b/.test(sql);
      expect(filtra, `${nombre}: ${sql}`).to.equal(true);
      expect(params[0], nombre).to.equal(CLIENTE);
    });
  }

  it('el ledger no se edita: no hay UPDATE ni DELETE sobre stock_movimiento', () => {
    const src = require('fs').readFileSync(require.resolve('../model/inventario/db'), 'utf8');
    expect(src).to.not.match(/(UPDATE|DELETE FROM)\s+stock_movimiento/i);
  });
});

// ─── Service ──────────────────────────────────────────────────────────────
describe('Inventario — service', () => {
  let insert;
  beforeEach(() => {
    sinon.stub(db, 'lockItem').resolves(ITEM);
    sinon.stub(db, 'getItem').resolves(ITEM_SALDO);
    sinon.stub(db, 'setCostoUnitario').resolves();
    insert = sinon.stub(db, 'insertMovimiento').callsFake(async (_c, m) => ({ id: 1, ...m }));
  });

  describe('compra', () => {
    it('con gasto y caja abierta: crea el gasto VAR y lo enlaza al movimiento', async () => {
      sinon.stub(salidaCajaDb, 'tenantUsaCaja').resolves(true);
      sinon.stub(db, 'getCajaAbiertaId').resolves(12);
      sinon.stub(db, 'getCategoriaTipoId').withArgs('VAR').resolves(2);
      const crearGasto = sinon.stub(salidaCajaDb, 'createSalidaCaja').resolves({ id: 99 });

      const r = await service.registrarMovimiento(CLIENTE, USUARIO, {
        tipo: 'compra', stock_item_id: 3, cantidad: 2.5, costo_total: 30000, registrar_gasto: true,
      });

      const g = crearGasto.firstCall.args[0];
      expect(g).to.include({ registro_diario_id: 12, categoria_salida_id: 2, monto: 30000, usuario_id: USUARIO, cliente_id: CLIENTE });
      expect(g.descripcion).to.equal('Compra: Mozzarella (2.5 kg)');
      expect(insert.firstCall.args[1]).to.include({ tipo: 'compra', cantidad: 2.5, costo_total: 30000, salida_caja_id: 99, usuario_id: USUARIO });
      expect(db.setCostoUnitario.firstCall.args).to.deep.equal([CLIENTE, 3, 12000]);
      expect(r.gasto.id).to.equal(99);
    });

    it('con gasto y caja cerrada: 409 y no asienta nada', async () => {
      sinon.stub(salidaCajaDb, 'tenantUsaCaja').resolves(true);
      sinon.stub(db, 'getCajaAbiertaId').resolves(null);
      const crearGasto = sinon.stub(salidaCajaDb, 'createSalidaCaja');
      const e = await esperarError(service.registrarMovimiento(CLIENTE, USUARIO, {
        tipo: 'compra', stock_item_id: 3, cantidad: 1, costo_total: 100, registrar_gasto: true,
      }));
      expect(e.status).to.equal(409);
      expect(e.code).to.equal('CAJA_CERRADA');
      expect(crearGasto.called).to.equal(false);
      expect(insert.called).to.equal(false);
    });

    it('comercio sin caja: el gasto va sin registro diario', async () => {
      sinon.stub(salidaCajaDb, 'tenantUsaCaja').resolves(false);
      const caja = sinon.stub(db, 'getCajaAbiertaId');
      sinon.stub(db, 'getCategoriaTipoId').resolves(2);
      const crearGasto = sinon.stub(salidaCajaDb, 'createSalidaCaja').resolves({ id: 5 });
      await service.registrarMovimiento(CLIENTE, USUARIO, { tipo: 'compra', stock_item_id: 3, cantidad: 1, costo_total: 100, registrar_gasto: true });
      expect(crearGasto.firstCall.args[0].registro_diario_id).to.equal(null);
      expect(caja.called).to.equal(false);
    });

    it('registrar_gasto sin costo: 400', async () => {
      const e = await esperarError(service.registrarMovimiento(CLIENTE, USUARIO, { tipo: 'compra', stock_item_id: 3, cantidad: 1, registrar_gasto: true }));
      expect(e.status).to.equal(400);
      expect(insert.called).to.equal(false);
    });

    it('sin gasto: sólo el movimiento', async () => {
      const crearGasto = sinon.stub(salidaCajaDb, 'createSalidaCaja');
      await service.registrarMovimiento(CLIENTE, USUARIO, { tipo: 'compra', stock_item_id: 3, cantidad: 1, costo_total: 500 });
      expect(crearGasto.called).to.equal(false);
      expect(insert.firstCall.args[1].salida_caja_id).to.equal(null);
    });

    it('convierte g a kg y rechaza unidades de otra magnitud', async () => {
      await service.registrarMovimiento(CLIENTE, USUARIO, { tipo: 'compra', stock_item_id: 3, cantidad: 500, unidad: 'g' });
      expect(insert.firstCall.args[1].cantidad).to.equal(0.5);
      const e = await esperarError(service.registrarMovimiento(CLIENTE, USUARIO, { tipo: 'compra', stock_item_id: 3, cantidad: 1, unidad: 'ml' }));
      expect(e.status).to.equal(400);
    });

    it('medio de pago inválido: 400 antes de crear el gasto', async () => {
      sinon.stub(salidaCajaDb, 'getMediosPagoIds').resolves([1, 2]);
      const crearGasto = sinon.stub(salidaCajaDb, 'createSalidaCaja');
      const e = await esperarError(service.registrarMovimiento(CLIENTE, USUARIO, {
        tipo: 'compra', stock_item_id: 3, cantidad: 1, costo_total: 100, registrar_gasto: true, medio_pago_id: 9,
      }));
      expect(e.status).to.equal(400);
      expect(crearGasto.called).to.equal(false);
    });
  });

  it('merma: se asienta negativa', async () => {
    await service.registrarMovimiento(CLIENTE, USUARIO, { tipo: 'merma', stock_item_id: 3, cantidad: 0.3, nota: 'se venció' });
    expect(insert.firstCall.args[1]).to.include({ tipo: 'merma', cantidad: -0.3, nota: 'se venció' });
  });

  describe('ajuste por conteo', () => {
    it('asienta la diferencia contra el ledger', async () => {
      sinon.stub(db, 'getStock').resolves(10);
      await service.registrarMovimiento(CLIENTE, USUARIO, { tipo: 'ajuste', stock_item_id: 3, contado: 7.25 });
      expect(insert.firstCall.args[1]).to.include({ tipo: 'ajuste', cantidad: -2.75 });
    });

    it('sin diferencia no inserta', async () => {
      sinon.stub(db, 'getStock').resolves(10);
      const r = await service.registrarMovimiento(CLIENTE, USUARIO, { tipo: 'ajuste', stock_item_id: 3, contado: 10 });
      expect(r.sin_cambios).to.equal(true);
      expect(insert.called).to.equal(false);
    });

    it('bloquea el ítem antes de leer el stock (conteos simultáneos)', async () => {
      const stock = sinon.stub(db, 'getStock').resolves(10);
      await service.registrarMovimiento(CLIENTE, USUARIO, { tipo: 'ajuste', stock_item_id: 3, contado: 8 });
      expect(db.lockItem.calledBefore(stock)).to.equal(true);
    });
  });

  it('ítem dado de baja: 409', async () => {
    db.lockItem.resolves({ ...ITEM, activo: false });
    const e = await esperarError(service.registrarMovimiento(CLIENTE, USUARIO, { tipo: 'merma', stock_item_id: 3, cantidad: 1 }));
    expect(e.status).to.equal(409);
  });

  it('tipo venta no se acepta por API (lo asienta el pedido, Fase 2)', async () => {
    const e = await esperarError(service.registrarMovimiento(CLIENTE, USUARIO, { tipo: 'venta', stock_item_id: 3, cantidad: 1 }));
    expect(e.status).to.equal(400);
  });
});

describe('Inventario — ítems', () => {
  it('estado: negativo / sin_stock / bajo / ok', () => {
    const { conEstado } = service._interno;
    expect(conEstado({ stock: '-1', stock_minimo: '5' }).estado).to.equal('negativo');
    expect(conEstado({ stock: '0', stock_minimo: null }).estado).to.equal('sin_stock');
    expect(conEstado({ stock: '2', stock_minimo: '5' }).estado).to.equal('bajo');
    expect(conEstado({ stock: '9', stock_minimo: '5' }).estado).to.equal('ok');
    expect(conEstado({ stock: '9', stock_minimo: null }).estado).to.equal('ok');
  });

  it('nombre: normaliza espacios y rechaza HTML', () => {
    const { nombreValido } = service._interno;
    expect(nombreValido('  Queso   rallado ')).to.equal('Queso rallado');
    expect(() => nombreValido('<img src=x onerror=alert(1)>')).to.throw(/no permitidos/);
  });

  it('nombre duplicado: 409', async () => {
    sinon.stub(db, 'createItem').rejects(Object.assign(new Error('dup'), { code: '23505' }));
    const e = await esperarError(service.crearItem(CLIENTE, { nombre: 'Harina', unidad: 'kg' }));
    expect(e.status).to.equal(409);
  });

  it('la unidad no se puede cambiar', async () => {
    const e = await esperarError(service.actualizarItem(CLIENTE, 3, { unidad: 'u' }));
    expect(e.code).to.equal('UNIDAD_FIJA');
  });

  it('reactivar un ítem respeta el límite del plan', async () => {
    sinon.stub(db, 'getItem').resolves({ ...ITEM_SALDO, activo: false });
    sinon.stub(planService, 'getClienteTierAndFeatures').resolves({ features: { maxStockItems: 2 }, tierCode: 'BASIC' });
    sinon.stub(db, 'listItems').resolves([{}, {}]);
    const upd = sinon.stub(db, 'updateItem');
    const e = await esperarError(service.actualizarItem(CLIENTE, 3, { activo: true }));
    expect(e.status).to.equal(403);
    expect(upd.called).to.equal(false);
  });

  it('editar un ítem activo mandando activo:true no consulta el límite', async () => {
    sinon.stub(db, 'getItem').resolves(ITEM_SALDO);
    const plan = sinon.stub(planService, 'getClienteTierAndFeatures');
    sinon.stub(db, 'updateItem').resolves(true);
    await service.actualizarItem(CLIENTE, 3, { nombre: 'Muzza', activo: true });
    expect(plan.called).to.equal(false);
  });
});

// ─── HTTP ─────────────────────────────────────────────────────────────────
describe('Inventario — HTTP /api/inventario', () => {
  const TODOS = ['inventario.list', 'inventario.create', 'inventario.update', 'inventario.delete'];
  const token = ({ modules = ['inventario'], perms = TODOS } = {}) => jwt.sign(
    { userId: USUARIO, cliente_id: CLIENTE, role: ['admin'], modules, permissions: { inventario: perms } },
    process.env.JWT_SECRET, { expiresIn: '1h' }
  );
  const conPlan = (features) => sinon.stub(planService, 'getClienteTierAndFeatures')
    .resolves({ features, tierCode: 'BASIC', isExpired: false });

  it('sin módulo: 403', async () => {
    const res = await request(app).get('/api/inventario/items').set('Authorization', `Bearer ${token({ modules: [] })}`);
    expect(res.status).to.equal(403);
  });

  it('plan sin inventario: 403 PLAN_INACTIVE', async () => {
    conPlan({ canUseInventario: false });
    const res = await request(app).get('/api/inventario/items').set('Authorization', `Bearer ${token()}`);
    expect(res.status).to.equal(403);
    expect(res.body.code).to.equal('PLAN_INACTIVE');
  });

  it('sin permiso de la acción: 403', async () => {
    conPlan({ canUseInventario: true });
    const res = await request(app).post('/api/inventario/movimientos')
      .set('Authorization', `Bearer ${token({ perms: ['inventario.list'] })}`)
      .send({ tipo: 'merma', stock_item_id: 3, cantidad: 1 });
    expect(res.status).to.equal(403);
  });

  it('cliente_id ajeno en el body: lo frena scopeTenant', async () => {
    const svc = sinon.stub(service, 'registrarMovimiento');
    sinon.stub(console, 'warn');
    const res = await request(app).post('/api/inventario/movimientos')
      .set('Authorization', `Bearer ${token()}`)
      .send({ tipo: 'merma', stock_item_id: 3, cantidad: 1, cliente_id: 1 });
    expect(res.status).to.equal(403);
    expect(svc.called).to.equal(false);
  });

  it('movimiento: tenant y usuario salen del JWT, no del body', async () => {
    conPlan({ canUseInventario: true });
    const svc = sinon.stub(service, 'registrarMovimiento').resolves({ movimiento: { id: 1 } });
    const res = await request(app).post('/api/inventario/movimientos')
      .set('Authorization', `Bearer ${token()}`)
      .send({ tipo: 'merma', stock_item_id: 3, cantidad: 1, usuario_id: 999 });
    expect(res.status).to.equal(201);
    const [cliente, usuario] = svc.firstCall.args;
    expect(cliente).to.equal(CLIENTE);
    expect(usuario).to.equal(USUARIO);
  });

  it('errores de negocio salen con su status y code', async () => {
    conPlan({ canUseInventario: true });
    sinon.stub(service, 'registrarMovimiento').rejects(Object.assign(new Error('caja'), { status: 409, code: 'CAJA_CERRADA' }));
    const res = await request(app).post('/api/inventario/movimientos')
      .set('Authorization', `Bearer ${token()}`).send({});
    expect(res.status).to.equal(409);
    expect(res.body.code).to.equal('CAJA_CERRADA');
  });

  it('alta de ítem pasa por el límite del plan', async () => {
    conPlan({ canUseInventario: true, maxStockItems: 50 });
    sinon.stub(pool, 'query').resolves({ rows: [{ count: '50' }] });
    const res = await request(app).post('/api/inventario/items')
      .set('Authorization', `Bearer ${token()}`).send({ nombre: 'Harina', unidad: 'kg' });
    expect(res.status).to.equal(403);
    expect(res.body.error).to.match(/ítems de stock/);
  });
});
