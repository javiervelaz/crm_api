/**
 * inventarioFase3.test.js — aviso por Telegram al cruzar el mínimo y
 * preguntas de stock al harness interno.
 */
const sinon = require('sinon');

const pool = require('../pool');
const { runWith } = require('../tenantContext');
const { crearStoreTenant, despuesDelCommit } = require('../middleware/tenantConnection');
const usuariosDb = require('../model/canales/usuarios');
const canalesService = require('../services/canales/canalesService');
const telegram = require('../services/canales/telegramApi');
const cripto = require('../services/canales/cripto');
const db = require('../model/inventario/db');
const planService = require('../services/cliente/planService');
const consultas = require('../model/harness/consultas');
const avisosStock = require('../services/inventario/avisosStock');
const ventaStock = require('../services/inventario/ventaStockService');
const inventarioService = require('../services/inventario/inventarioService');
const { router } = require('../services/harness/core/router');
const { resolverSeguimiento } = require('../services/harness/core/seguimiento');
const { cantidad } = require('../services/harness/core/formato');
const { manejarTurno } = require('../services/harness/core/manejarTurno');

let expect;
before(async () => { ({ expect } = await import('chai')); });
afterEach(() => sinon.restore());

const C = 77;
const esperar = () => new Promise((r) => setImmediate(() => setImmediate(r)));

// ─── despuesDelCommit ─────────────────────────────────────────────────────
describe('Inventario F3 — despuesDelCommit', () => {
  const conStoreFalso = () => {
    const { store, settle } = crearStoreTenant(C);
    const client = { query: sinon.stub().resolves({ rows: [] }), release: sinon.stub() };
    store._initPromise = Promise.resolve(client);
    store.client = client;
    return { store, settle, client };
  };

  it('corre después del COMMIT', async () => {
    const { store, settle, client } = conStoreFalso();
    const fn = sinon.stub().resolves();
    runWith(store, () => despuesDelCommit(fn));
    expect(fn.called).to.equal(false);
    await settle(true);
    await esperar();
    expect(client.query.calledWith('COMMIT')).to.equal(true);
    expect(fn.calledOnce).to.equal(true);
  });

  it('con ROLLBACK no corre', async () => {
    const { store, settle } = conStoreFalso();
    const fn = sinon.stub().resolves();
    runWith(store, () => despuesDelCommit(fn));
    await settle(false);
    await esperar();
    expect(fn.called).to.equal(false);
  });

  it('si el COMMIT falla no corre', async () => {
    const { store, settle, client } = conStoreFalso();
    client.query.withArgs('COMMIT').rejects(new Error('serialization'));
    sinon.stub(console, 'error');
    const fn = sinon.stub().resolves();
    runWith(store, () => despuesDelCommit(fn));
    await settle(true);
    await esperar();
    expect(fn.called).to.equal(false);
  });

  it('fuera de un tenant corre en el próximo tick y un error no se propaga', async () => {
    sinon.stub(console, 'error');
    const fn = sinon.stub().rejects(new Error('telegram caído'));
    despuesDelCommit(fn);
    await esperar();
    expect(fn.calledOnce).to.equal(true);
  });
});

// ─── aviso de stock ───────────────────────────────────────────────────────
describe('Inventario F3 — aviso al cruzar el mínimo', () => {
  it('texto: cantidades legibles y sin stock', () => {
    const t = avisosStock.textoCruces([
      { nombre: 'Mozzarella', unidad: 'kg', actual: 0.8, minimo: 5 },
      { nombre: 'Gaseosa', unidad: 'u', actual: 0, minimo: 6 },
    ]);
    expect(t).to.include('Se están acabando 2 insumos');
    expect(t).to.include('• Mozzarella: quedan 800 g (mínimo 5 kg)');
    expect(t).to.include('• Gaseosa: sin stock (mínimo 6 u)');
  });

  it('va a quienes tienen avisos y el módulo inventario, y sale después del COMMIT', async () => {
    const dest = sinon.stub(usuariosDb, 'getDestinatariosAvisos').resolves([{ chat_id: 11, canal_cuenta_id: 1, credenciales_enc: 'x' }]);
    sinon.stub(cripto, 'desencriptar').returns('TOKEN');
    const send = sinon.stub(telegram, 'sendMessage').resolves({});
    const { store, settle } = crearStoreTenant(C);
    await runWith(store, () => avisosStock.avisarCruces(C, [{ nombre: 'Mozzarella', unidad: 'kg', actual: 4, minimo: 5 }]));
    expect(dest.firstCall.args).to.deep.equal([C, 'inventario']);
    expect(send.called).to.equal(false); // todavía no hubo COMMIT
    await settle(true);
    await esperar();
    expect(send.calledOnceWith('TOKEN', 11)).to.equal(true);
  });

  it('los avisos de pedidos siguen yendo a quien tiene Pedidos', async () => {
    const dest = sinon.stub(usuariosDb, 'getDestinatariosAvisos').resolves([]);
    await canalesService.prepararAvisos(C, { total: 100, nombre: 'Ana', items: [] });
    expect(dest.firstCall.args).to.deep.equal([C, 'operaciones']);
  });

  it('destinatarios: el módulo va como parámetro, no interpolado', async () => {
    const q = sinon.stub(pool, 'query').resolves({ rows: [] });
    await usuariosDb.getDestinatariosAvisos(C, 'inventario');
    expect(q.firstCall.args[0]).to.match(/m\.codigo = \$3/);
    expect(q.firstCall.args[1][2]).to.equal('inventario');
  });

  it('una venta que cruza el mínimo avisa; una que no cruza, no', async () => {
    sinon.stub(db, 'tenantUsaInventario').resolves(true);
    sinon.stub(planService, 'getClienteTierAndFeatures').resolves({ features: { canUseInventario: true }, isExpired: false });
    sinon.stub(db, 'getNetoVentaPorPedido').resolves([]);
    sinon.stub(db, 'getRecetasPorProductos').resolves([
      { producto_id: 1, stock_item_id: 10, cantidad_por_unidad: '0.25', nombre: 'Mozzarella', unidad: 'kg', stock_minimo: '5' },
    ]);
    const stocks = sinon.stub(db, 'getStocks').resolves(new Map([[10, 5.1]]));
    sinon.stub(db, 'insertMovimiento').resolves({ id: 1 });
    const avisar = sinon.stub(avisosStock, 'avisarCruces').resolves(true);

    await ventaStock.descontarPorPedido(C, { pedido_id: 1, usuario_id: 5, lineas: [{ producto_id: 1, cantidad: 1 }] });
    expect(avisar.firstCall.args[1].map((c) => c.nombre)).to.deep.equal(['Mozzarella']);
    expect(avisar.firstCall.args[1][0]).to.include({ unidad: 'kg', minimo: 5 });

    // ya estaba bajo el mínimo: no vuelve a avisar
    stocks.resolves(new Map([[10, 4]]));
    db.getNetoVentaPorPedido.resolves([]);
    await ventaStock.descontarPorPedido(C, { pedido_id: 2, usuario_id: 5, lineas: [{ producto_id: 1, cantidad: 1 }] });
    expect(avisar.secondCall.args[1]).to.deep.equal([]);
  });

  it('una merma manual que cruza el mínimo también avisa', async () => {
    sinon.stub(db, 'lockItem').resolves({ id: 3, nombre: 'Queso', unidad: 'kg', activo: true, stock_minimo: '2' });
    sinon.stub(db, 'insertMovimiento').callsFake(async (_c, m) => ({ id: 1, ...m }));
    sinon.stub(db, 'getItem').resolves({ id: 3, nombre: 'Queso', tipo: 'insumo', unidad: 'kg', stock_minimo: '2', costo_unitario: null, activo: true, stock: '1.5' });
    const avisar = sinon.stub(avisosStock, 'avisarCruces').resolves(true);
    await inventarioService.registrarMovimiento(C, 5, { tipo: 'merma', stock_item_id: 3, cantidad: 1 });
    expect(avisar.firstCall.args[1][0]).to.include({ nombre: 'Queso', previo: 2.5, actual: 1.5, minimo: 2 });
  });

  it('una compra nunca avisa', async () => {
    sinon.stub(db, 'lockItem').resolves({ id: 3, nombre: 'Queso', unidad: 'kg', activo: true, stock_minimo: '2' });
    sinon.stub(db, 'insertMovimiento').callsFake(async (_c, m) => ({ id: 1, ...m }));
    sinon.stub(db, 'setCostoUnitario').resolves();
    sinon.stub(db, 'getItem').resolves({ id: 3, nombre: 'Queso', tipo: 'insumo', unidad: 'kg', stock_minimo: '2', costo_unitario: null, activo: true, stock: '1' });
    const avisar = sinon.stub(avisosStock, 'avisarCruces');
    await inventarioService.registrarMovimiento(C, 5, { tipo: 'compra', stock_item_id: 3, cantidad: 0.5 });
    expect(avisar.called).to.equal(false);
  });
});

// ─── harness ──────────────────────────────────────────────────────────────
describe('Inventario F3 — harness: router', () => {
  const casos = [
    ['¿Cuánta mozzarella me queda?', 'stock_item', 'mozzarella'],
    ['cuanto me queda de harina', 'stock_item', 'harina'],
    ['stock de gaseosas', 'stock_item', 'gaseosas'],
    ['cuántos kilos de queso tengo', 'stock_item', 'queso'],
    ['hay coca?', 'stock_item', 'coca'],
    ['como está el inventario', 'stock_item', null],
    ['¿Qué tengo que comprar?', 'stock_bajo'],
    ['qué me falta', 'stock_bajo'],
    ['lista de compras', 'stock_bajo'],
    ['qué se está acabando', 'stock_bajo'],
  ];
  for (const [texto, intent, item] of casos) {
    it(`"${texto}" → ${intent}`, () => {
      const r = router(texto);
      expect(r.intent).to.equal(intent);
      if (item !== undefined) expect(r.item).to.equal(item);
    });
  }

  it('no se roba preguntas de otros intents', () => {
    expect(router('cuánto gasté en mozzarella').intent).to.equal('gastos_periodo');
    expect(router('cuántas pizzas vendí hoy').intent).to.equal('ventas_producto');
    expect(router('cuántos pedidos hay')).to.equal(null);
    expect(router('cuánta plata me queda')).to.equal(null);
    expect(router('qué me falta pagar')).to.equal(null);
  });

  it('seguimiento: "¿y de harina?" después de un ítem; "¿y ayer?" no', () => {
    const previo = { intent: 'stock_item', params: { item: 'mozzarella' } };
    const opt = { hoy: '2026-11-02', tz: 'America/Argentina/Cordoba' };
    expect(resolverSeguimiento('y de harina?', previo, opt)).to.include({ intent: 'stock_item', item: 'harina' });
    expect(resolverSeguimiento('y ayer?', previo, opt)).to.equal(null);
  });
});

describe('Inventario F3 — harness: respuestas', () => {
  const ctx = (over = {}) => ({
    clienteId: C, userId: 5, rubroCodigo: 'gastronomia', tierCode: 'BASIC',
    features: { canUseInventario: true }, isExpired: false, timezone: 'America/Argentina/Cordoba', hoy: '2026-11-02',
    modules: ['inventario'], permissions: { inventario: ['inventario.list'] }, ...over,
  });
  const preguntar = (texto, c = ctx()) => manejarTurno({ clienteId: C, userId: 5, texto }, { cargarContexto: async () => c });

  const ITEMS = [
    { id: 1, nombre: 'Mozzarella', unidad: 'kg', tipo: 'insumo', stock: '4.875', stock_minimo: '5' },
    { id: 2, nombre: 'Harina 000', unidad: 'kg', tipo: 'insumo', stock: '12', stock_minimo: null },
    { id: 3, nombre: 'Coca Cola 1,5 l', unidad: 'u', tipo: 'producto', stock: '0', stock_minimo: '6' },
  ];

  it('cantidad: g/ml bajo 1, coma decimal', () => {
    expect(cantidad('0.8', 'kg')).to.equal('800 g');
    expect(cantidad('4.875', 'kg')).to.equal('4,875 kg');
    expect(cantidad('6', 'u')).to.equal('6 u');
  });

  it('¿cuánta mozzarella me queda?', async () => {
    sinon.stub(consultas, 'stockItems').resolves(ITEMS);
    const r = await preguntar('¿Cuánta mozzarella me queda?');
    expect(r.texto).to.equal('Mozzarella: 4,875 kg (mínimo 5 kg), por debajo del mínimo.');
    expect(consultas.stockItems.firstCall.args[0]).to.equal(C);
  });

  it('ítem que no existe', async () => {
    sinon.stub(consultas, 'stockItems').resolves(ITEMS);
    const r = await preguntar('cuanto me queda de tomate');
    expect(r.texto).to.match(/No encontré "tomate"/);
  });

  it('¿qué tengo que comprar?', async () => {
    sinon.stub(consultas, 'stockBajo').resolves([
      { nombre: 'Coca Cola 1,5 l', unidad: 'u', stock: '0', stock_minimo: '6', faltante: '6' },
      { nombre: 'Mozzarella', unidad: 'kg', stock: '4.875', stock_minimo: '5', faltante: '0.125' },
    ]);
    const r = await preguntar('¿Qué tengo que comprar?');
    expect(r.texto.split('\n')).to.deep.equal([
      'Para comprar (2):',
      '• Coca Cola 1,5 l: sin stock (mínimo 6 u, faltan 6 u)',
      '• Mozzarella: quedan 4,875 kg (mínimo 5 kg, faltan 125 g)',
    ]);
  });

  it('nada para comprar / sin mínimos / sin stock cargado', async () => {
    const bajo = sinon.stub(consultas, 'stockBajo').resolves([]);
    const items = sinon.stub(consultas, 'stockItems').resolves(ITEMS);
    expect((await preguntar('que tengo que comprar')).texto).to.equal('No te falta nada: todo está sobre el mínimo.');
    items.resolves([ITEMS[1]]);
    expect((await preguntar('que tengo que comprar')).texto).to.match(/Ningún ítem tiene un mínimo/);
    items.resolves([]);
    expect((await preguntar('que tengo que comprar')).texto).to.match(/Todavía no cargaste stock/);
    expect(bajo.callCount).to.equal(3);
  });

  it('resumen del stock', async () => {
    sinon.stub(consultas, 'stockItems').resolves(ITEMS);
    const r = await preguntar('cómo está el stock');
    expect(r.texto).to.include('Tenés 3 ítems en stock.');
    expect(r.texto).to.include('Sin stock: Coca Cola 1,5 l.');
    expect(r.texto).to.include('Bajo el mínimo: 2 ítems.');
  });

  it('plan sin inventario: no ejecuta la consulta', async () => {
    const q = sinon.stub(consultas, 'stockItems');
    const r = await preguntar('¿Cuánta mozzarella me queda?', ctx({ features: { canUseInventario: false } }));
    expect(q.called).to.equal(false);
    expect(r.texto).to.match(/plan pago/);
  });

  it('usuario sin el módulo inventario: no ejecuta la consulta', async () => {
    const q = sinon.stub(consultas, 'stockBajo');
    const r = await preguntar('¿Qué tengo que comprar?', ctx({ modules: ['operaciones'], permissions: {} }));
    expect(q.called).to.equal(false);
    expect(r.texto).to.match(/dueño/);
  });
});
