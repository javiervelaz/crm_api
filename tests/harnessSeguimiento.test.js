/**
 * harnessSeguimiento.test.js — "¿y ayer?", "¿y los gastos?", "¿y de pizza?"
 */
const sinon = require('sinon');

const pool = require('../pool');
const consultas = require('../model/harness/consultas');
const estadoDb = require('../model/harness/estado');
const { resolverSeguimiento, aEstado } = require('../services/harness/core/seguimiento');
const { manejarTurno } = require('../services/harness/core/manejarTurno');

let expect;
before(async () => { ({ expect } = await import('chai')); });
afterEach(() => sinon.restore());

const HOY = '2026-10-28';
const opt = { hoy: HOY };
const previo = (intent, texto, producto = null) => ({ intent, params: { texto, producto } });

describe('resolverSeguimiento', () => {
  it('sólo una ventana → misma consulta, otro período', () => {
    for (const msg of ['y ayer?', 'ayer', 'y el mes pasado', 'y esta semana?', 'y en septiembre']) {
      const r = resolverSeguimiento(msg, previo('ventas_periodo', 'cuanto vendi hoy'), opt);
      expect(r, msg).to.include({ intent: 'ventas_periodo', seguimiento: true });
    }
  });

  it('conserva el producto al cambiar el período', () => {
    const r = resolverSeguimiento('y ayer?', previo('ventas_producto', 'cuantas pizzas vendi hoy', 'pizzas'), opt);
    expect(r).to.include({ intent: 'ventas_producto', producto: 'pizzas' });
  });

  it('otro tema sin ventana → intent nuevo con la ventana anterior', () => {
    const r = resolverSeguimiento('y los gastos?', previo('ventas_periodo', 'cuanto vendi el mes pasado'), opt);
    expect(r).to.include({ intent: 'gastos_periodo', texto: 'cuanto vendi el mes pasado', seguimiento: true });
    expect(resolverSeguimiento('y sueldos', previo('gastos_periodo', 'en que gaste ayer'), opt).intent).to.equal('gastos_sueldos');
    expect(resolverSeguimiento('y clientes nuevos?', previo('ventas_periodo', 'cuanto vendi esta semana'), opt).intent).to.equal('clientes_nuevos');
  });

  it('otro producto → ventas_producto con el mismo período', () => {
    const r = resolverSeguimiento('y de pizza?', previo('ventas_producto', 'cuantas empanadas vendi esta semana', 'empanadas'), opt);
    expect(r).to.include({ intent: 'ventas_producto', producto: 'pizza', texto: 'cuantas empanadas vendi esta semana' });
  });

  it('una consulta completa NO es un seguimiento', () => {
    for (const msg of ['y cuanto vendi ayer de empanadas en el local', 'cuanto vendi ayer', 'en que gaste esta semana']) {
      expect(resolverSeguimiento(msg, previo('ventas_periodo', 'cuanto vendi hoy'), opt), msg).to.equal(null);
    }
  });

  it('sin estado previo o con un intent sin ventana: null', () => {
    expect(resolverSeguimiento('y ayer?', null, opt)).to.equal(null);
    expect(resolverSeguimiento('y ayer?', previo('estado_caja', 'esta abierta la caja'), opt)).to.equal(null);
  });

  it('comparar no se encadena', () => {
    expect(resolverSeguimiento('y ventas', previo('ventas_periodo', 'x'), opt)).to.include({ intent: 'ventas_periodo' }); // tema ventas, no compara
    const r = resolverSeguimiento('y comparar ventas', previo('ventas_periodo', 'x'), opt);
    expect(r).to.equal(null);
  });

  it('texto largo o vacío: null', () => {
    expect(resolverSeguimiento('', previo('ventas_periodo', 'x'), opt)).to.equal(null);
    expect(resolverSeguimiento('y ayer me pasaron muchas cosas raras con los proveedores del barrio', previo('ventas_periodo', 'x'), opt)).to.equal(null);
  });

  it('aEstado: sólo intents con ventana; guarda texto y producto, nunca montos', () => {
    expect(aEstado({ intent: 'ventas_periodo', texto: 'cuanto vendi hoy' })).to.eql({ intent: 'ventas_periodo', params: { texto: 'cuanto vendi hoy', producto: null } });
    expect(aEstado({ intent: 'estado_caja', texto: 'x' })).to.equal(null);
    expect(aEstado({ intent: 'ayuda', texto: 'x' })).to.equal(null);
  });
});

describe('manejarTurno con seguimiento', () => {
  const ctx = (over = {}) => ({
    clienteId: 7, userId: 21, rubroCodigo: 'gastronomia', features: { canUseReports: true }, isExpired: false,
    timezone: 'America/Argentina/Cordoba', hoy: HOY,
    modules: ['reportes', 'gasto'], permissions: { reportes: ['reportes.list'], gasto: ['gasto.list'] }, ...over,
  });
  const chat = { canalCuentaId: 40, chatId: '555' };
  const armar = (c = ctx()) => {
    let guardado = null;
    const estado = { cargar: sinon.spy(async () => guardado), guardar: sinon.spy(async (cl, cu, ch, e) => { guardado = { intent: e.intent, params: e.params }; }) };
    const turno = (texto) => manejarTurno({ clienteId: 7, userId: 21, texto, chat }, { cargarContexto: async () => c, estado });
    return { estado, turno };
  };

  it('"cuánto vendí hoy" → "y ayer?" consulta ayer con el mismo intent', async () => {
    const t = sinon.stub(consultas, 'ventasTotales').resolves({ total: '1000', pedidos: 1, ticket: '1000' });
    const { turno, estado } = armar();
    expect((await turno('cuanto vendi hoy')).stage).to.equal('ejecutor');
    const r = await turno('y ayer?');
    expect(r).to.include({ intent: 'ventas_periodo', stage: 'seguimiento' });
    expect(t.secondCall.args).to.eql([7, '2026-10-27', '2026-10-27']);
    expect(estado.guardar.firstCall.args.slice(0, 3)).to.eql([7, 40, '555']);
  });

  it('"y los gastos?" hereda el período anterior', async () => {
    sinon.stub(consultas, 'ventasTotales').resolves({ total: '1000', pedidos: 1, ticket: '1000' });
    sinon.stub(consultas, 'ventasMejorDia').resolves(null);
    const g = sinon.stub(consultas, 'gastosPorTipo').resolves([{ codigo: 'FI', tipo: 'fijo', total: '5000', cantidad: 1 }]);
    sinon.stub(consultas, 'gastosTotal').resolves('5000');
    sinon.stub(consultas, 'gastosPorDescripcion').resolves([]);
    const { turno } = armar();
    await turno('cuanto vendi el mes pasado');
    const r = await turno('y los gastos?');
    expect(r).to.include({ intent: 'gastos_periodo', stage: 'seguimiento' });
    expect(g.firstCall.args).to.eql([7, '2026-09-01', '2026-09-30']);
  });

  it('el seguimiento pasa por la autorización: sin gasto.list no ve gastos', async () => {
    sinon.stub(consultas, 'ventasTotales').resolves({ total: '1000', pedidos: 1, ticket: '1000' });
    const g = sinon.stub(consultas, 'gastosPorTipo');
    const { turno } = armar(ctx({ permissions: { reportes: ['reportes.list'], gasto: [] } }));
    await turno('cuanto vendi hoy');
    const r = await turno('y los gastos?');
    expect(g.called).to.equal(false);
    expect(r.stage).to.equal('negado_permiso');
    expect(r.texto).to.not.match(/\$/);
  });

  it('una negativa no pisa el contexto', async () => {
    sinon.stub(consultas, 'ventasTotales').resolves({ total: '1000', pedidos: 1, ticket: '1000' });
    const { turno, estado } = armar(ctx({ permissions: { reportes: ['reportes.list'], gasto: [] } }));
    await turno('cuanto vendi hoy');
    await turno('y los gastos?');
    expect(estado.guardar.callCount).to.equal(1);
  });

  it('sin estado (vencido) un "y ayer?" suelto cae en el fallback', async () => {
    const { turno } = armar();
    const r = await turno('y ayer?');
    expect(r.intent).to.equal('no_entendido');
  });

  it('sin chat no hay estado: comportamiento de siempre', async () => {
    sinon.stub(consultas, 'ventasTotales').resolves({ total: '1000', pedidos: 1, ticket: '1000' });
    const estado = { cargar: sinon.spy(), guardar: sinon.spy() };
    await manejarTurno({ clienteId: 7, userId: 21, texto: 'cuanto vendi hoy' }, { cargarContexto: async () => ctx(), estado });
    expect(estado.cargar.called).to.equal(false);
    expect(estado.guardar.called).to.equal(false);
  });

  it('si el estado falla, el turno responde igual', async () => {
    sinon.stub(console, 'error');
    sinon.stub(consultas, 'ventasTotales').resolves({ total: '1000', pedidos: 1, ticket: '1000' });
    const estado = { cargar: async () => { throw new Error('db'); }, guardar: async () => { throw new Error('db'); } };
    const r = await manejarTurno({ clienteId: 7, userId: 21, texto: 'cuanto vendi hoy', chat }, { cargarContexto: async () => ctx(), estado });
    expect(r.stage).to.equal('ejecutor');
    expect(r.texto).to.contain('$ 1.000');
  });
});

describe('model/harness/estado: aislamiento por cliente_id', () => {
  it('cargar y guardar filtran por cliente_id ($1) y por chat', async () => {
    const q = sinon.stub(pool, 'query').resolves({ rows: [] });
    await estadoDb.cargar(7, 40, '555');
    await estadoDb.guardar(7, 40, '555', { userId: 21, intent: 'ventas_periodo', params: { texto: 'x' }, ttlSegundos: 600 });
    expect(q.firstCall.args[0]).to.match(/cliente_id\s*=\s*\$1\b/);
    expect(q.firstCall.args[1]).to.eql([7, 40, '555']);
    expect(q.secondCall.args[0]).to.match(/ON CONFLICT \(cliente_id, canal_cuenta_id, chat_id\)/);
    expect(q.secondCall.args[1].slice(0, 3)).to.eql([7, 40, '555']);
  });
});
