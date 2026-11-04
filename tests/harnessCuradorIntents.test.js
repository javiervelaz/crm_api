/**
 * harnessCuradorIntents.test.js — primeros intents salidos del curador (04/11/2026),
 * de preguntas reales de turn_log que el router no entendía:
 *   "vendí algo hoy?"  → ventas_periodo (patrón nuevo)
 *   "que compre hoy?"  → compras_periodo (intent nuevo sobre stock_movimiento)
 */
const sinon = require('sinon');

const pool = require('../pool');
const consultas = require('../model/harness/consultas');
const { router } = require('../services/harness/core/router');
const { resolverSeguimiento } = require('../services/harness/core/seguimiento');
const { manejarTurno } = require('../services/harness/core/manejarTurno');

let expect;
before(async () => { ({ expect } = await import('chai')); });
afterEach(() => sinon.restore());

const C = 77;
const HOY = '2026-11-04';

describe('curador → router', () => {
  const casos = [
    // las dos preguntas tal cual llegaron a turn_log
    ['vendí algo hoy?', 'ventas_periodo'],
    ['que compre hoy?', 'compras_periodo'],
    // variantes
    ['se vendió algo ayer', 'ventas_periodo'],
    ['vendimos algo esta semana?', 'ventas_periodo'],
    ['hubo ventas hoy?', 'ventas_periodo'],
    ['qué compramos esta semana', 'compras_periodo'],
    ['qué compré ayer', 'compras_periodo'],
    ['mis compras de octubre', 'compras_periodo'],
    ['compras de ayer', 'compras_periodo'],
    ['cuánto compré este mes', 'compras_periodo'],
  ];
  for (const [texto, intent] of casos) {
    it(`"${texto}" → ${intent}`, () => expect(router(texto).intent).to.equal(intent));
  }

  it('"vendí algo de X" es ventas de un producto', () => {
    expect(router('vendí algo de pizza')).to.include({ intent: 'ventas_producto', producto: 'pizza' });
  });

  it('presente ≠ pasado: "qué compro" sigue siendo lo que falta', () => {
    expect(router('qué compro?').intent).to.equal('stock_bajo');
    expect(router('qué tengo que comprar').intent).to.equal('stock_bajo');
    expect(router('lista de compras').intent).to.equal('stock_bajo');
  });

  it('no se roba preguntas de otros intents', () => {
    expect(router('cuánto gasté en compras').intent).to.equal('gastos_periodo');
    expect(router('compará las ventas de este mes con el pasado').intent).to.equal('ventas_comparar');
    expect(router('cuántas pizzas vendí hoy').intent).to.equal('ventas_producto');
    expect(router('algo')).to.equal(null);
  });

  it('seguimiento: "¿y ayer?" después de compras repite compras con otra ventana', () => {
    const previo = { intent: 'compras_periodo', params: { texto: 'que compre hoy' } };
    const r = resolverSeguimiento('y ayer?', previo, { hoy: HOY, tz: 'America/Argentina/Cordoba' });
    expect(r).to.include({ intent: 'compras_periodo', seguimiento: true });
  });
});

describe('curador → compras_periodo: respuestas', () => {
  const ctx = (over = {}) => ({
    clienteId: C, userId: 5, rubroCodigo: 'gastronomia', tierCode: 'BASIC',
    features: { canUseInventario: true, canUseReports: true }, isExpired: false,
    timezone: 'America/Argentina/Cordoba', hoy: HOY,
    modules: ['inventario', 'reportes'], permissions: { inventario: ['inventario.list'], reportes: ['reportes.list'] }, ...over,
  });
  const preguntar = (texto, c = ctx()) => manejarTurno({ clienteId: C, userId: 5, texto }, { cargarContexto: async () => c });
  const fila = (nombre, unidad, cant, costo, compras = 1, sinCosto = 0, periodo = '0') => ({
    nombre, unidad, cantidad: cant, costo, compras, sin_costo: sinCosto, costo_periodo: periodo,
  });

  it('lista por ítem con total del período (plata exacta, sin float)', async () => {
    sinon.stub(consultas, 'comprasPeriodo').resolves([
      fila('Mozzarella', 'kg', '5.000', '30000.10', 2, 0, '45000.10'),
      fila('Harina 000', 'kg', '0.500', '15000.00', 1, 0, '45000.10'),
    ]);
    const r = await preguntar('que compre hoy?');
    expect(r).to.include({ intent: 'compras_periodo', stage: 'ejecutor' });
    expect(r.texto.split('\n')).to.deep.equal([
      'Compras hoy: 3 compras de 2 ítems por $ 45.000,10.',
      '• Mozzarella: 5 kg — $ 30.000,10',
      '• Harina 000: 500 g — $ 15.000',
    ]);
    const [cid, desde, hasta] = consultas.comprasPeriodo.firstCall.args;
    expect([cid, desde, hasta]).to.deep.equal([C, HOY, HOY]);
  });

  it('compras sin costo: se listan sin monto y se aclara que no suman', async () => {
    sinon.stub(consultas, 'comprasPeriodo').resolves([
      fila('Mozzarella', 'kg', '2', '12000', 1, 0, '12000'),
      fila('Coca Cola', 'u', '12', null, 1, 1, '12000'),
    ]);
    const r = await preguntar('qué compré esta semana');
    expect(r.texto).to.include('por $ 12.000.');
    expect(r.texto).to.include('• Coca Cola: 12 u');
    expect(r.texto).to.include('(1 compra sin costo cargado, no entra en el total)');
  });

  it('todas sin costo: no inventa un total', async () => {
    sinon.stub(consultas, 'comprasPeriodo').resolves([fila('Coca Cola', 'u', '12', null, 1, 1, '0')]);
    const r = await preguntar('que compre hoy');
    expect(r.texto.split('\n')[0]).to.equal('Compras hoy: 1 compra de 1 ítem.');
    expect(r.texto).to.not.include('$');
  });

  it('sin compras: lo dice y sugiere los gastos', async () => {
    sinon.stub(consultas, 'comprasPeriodo').resolves([]);
    const r = await preguntar('que compre ayer');
    expect(r.texto).to.match(/^No registraste compras de stock ayer\./);
    expect(r.texto).to.include('en qué gasté ayer');
  });

  it('plan sin inventario: no ejecuta la consulta', async () => {
    const q = sinon.stub(consultas, 'comprasPeriodo');
    const r = await preguntar('que compre hoy', ctx({ features: { canUseInventario: false } }));
    expect(q.called).to.equal(false);
    expect(r.texto).to.match(/plan pago/);
  });

  it('usuario sin inventario.list: no ejecuta la consulta ni filtra datos', async () => {
    const q = sinon.stub(consultas, 'comprasPeriodo');
    const r = await preguntar('que compre hoy', ctx({ modules: ['reportes'], permissions: { reportes: ['reportes.list'] } }));
    expect(q.called).to.equal(false);
    expect(r.stage).to.match(/^negado_/);
    expect(r.texto).to.match(/dueño/);
  });

  it('"vendí algo hoy?" responde con ventas_periodo', async () => {
    sinon.stub(consultas, 'ventasTotales').resolves({ total: '0', pedidos: 0, ticket: '0' });
    const r = await preguntar('vendí algo hoy?');
    expect(r).to.include({ intent: 'ventas_periodo', stage: 'ejecutor' });
    expect(r.texto).to.equal('No registraste ventas hoy.');
  });
});

describe('curador → comprasPeriodo (SQL)', () => {
  it('filtra por cliente_id = $1, sólo compras, y une stock_item por (id, cliente_id)', async () => {
    const q = sinon.stub(pool, 'query').resolves({ rows: [] });
    await consultas.comprasPeriodo(C, '2026-11-01', '2026-11-04');
    const [sql, params] = q.firstCall.args;
    expect(sql).to.match(/m\.cliente_id = \$1/);
    expect(sql).to.match(/i\.cliente_id = m\.cliente_id/);
    expect(sql).to.match(/m\.tipo = 'compra'/);
    expect(sql).to.not.match(/\$\{|'\s*\+/); // sin interpolación de valores
    expect(params).to.deep.equal([C, '2026-11-01', '2026-11-04']);
  });
});
