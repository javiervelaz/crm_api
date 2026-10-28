/**
 * harnessIntents.test.js — paso 5 (parte 2): router, intents de gastronomía,
 * formato de plata, manejarTurno y aislamiento por cliente_id de las consultas.
 */
const sinon = require('sinon');

const pool = require('../pool');
const consultas = require('../model/harness/consultas');
const { router } = require('../services/harness/core/router');
const { moneda, variacion } = require('../services/harness/core/formato');
const { parsearVentana } = require('../services/harness/core/ventana');
const { manejarTurno } = require('../services/harness/core/manejarTurno');
const { CATALOGO, _internos } = require('../services/harness/gastronomia/catalogo');
const mensajesInternos = require('../services/canales/mensajesInternos');

let expect;
before(async () => { ({ expect } = await import('chai')); });
afterEach(() => sinon.restore());

const HOY = '2026-10-28';
const ctxBase = (over = {}) => ({
  clienteId: 7, userId: 21, rubroCodigo: 'gastronomia', tierCode: 'PREMIUM',
  features: { canUseReports: true }, isExpired: false, timezone: 'America/Argentina/Cordoba', hoy: HOY,
  modules: ['reportes', 'gasto'], permissions: { reportes: ['reportes.list'], gasto: ['gasto.list'] }, ...over,
});
const turno = (texto, ctx = ctxBase()) => manejarTurno({ clienteId: 7, userId: 21, texto }, { cargarContexto: async () => ctx });

describe('router (etapa 1)', () => {
  const casos = [
    ['Holaaa', 'ayuda'],
    ['hola bot', 'ayuda'],
    ['Cuanto vendi hoy?', 'ventas_periodo'],
    ['cuánta plata entró ayer', 'ventas_periodo'],
    ['ventas de esta semana', 'ventas_periodo'],
    ['En qué gaste está semana?', 'gastos_periodo'],
    ['cuánto pagamos de gastos en octubre', 'gastos_periodo'],
    ['Cuánto pague de sueldo el mes pasado?', 'gastos_sueldos'],
    ['Cuantas hamburguesas vendí desde el 1 al 15 de este mes?', 'ventas_producto'],
    ['cuánto vendí de pizza esta semana', 'ventas_producto'],
    ['Cuántos clientes nuevos tuve en octubre?', 'clientes_nuevos'],
    ['¿Está abierta la caja?', 'estado_caja'],
    ['cómo está la caja', 'estado_caja'],
    ['cómo fue el último cierre de caja', 'ultimo_cierre'],
    ['con cuánto cerré ayer', 'ultimo_cierre'],
    ['Compara las entradas de este mes con las de el mes pasado y dame un reporte', 'ventas_comparar'],
    ['comparame las ventas de esta semana con la pasada', 'ventas_comparar'],
  ];
  for (const [texto, intent] of casos) {
    it(`"${texto}" → ${intent}`, () => expect(router(texto).intent).to.equal(intent));
  }
  it('texto sin intent → null (no se inventa)', () => {
    expect(router('blabla')).to.equal(null);
    expect(router('')).to.equal(null);
  });
  it('extrae el producto', () => {
    expect(router('Cuantas hamburguesas vendí del 1 al 15').producto).to.equal('hamburguesas');
    expect(router('cuánto vendí de pizza esta semana').producto).to.equal('pizza esta semana');
  });
});

describe('ventana: rango con "desde … hasta" y "de este mes"', () => {
  const opt = { hoy: HOY };
  it('desde el 1 al 15 de este mes', () => {
    const v = parsearVentana('cuantas vendi desde el 1 al 15 de este mes', opt);
    expect([v.desde, v.hasta]).to.eql(['2026-10-01', '2026-10-15']);
  });
  it('desde el 5 hasta el 10 del mes pasado', () => {
    const v = parsearVentana('desde el 5 hasta el 10 del mes pasado', opt);
    expect([v.desde, v.hasta]).to.eql(['2026-09-05', '2026-09-10']);
  });
  it('del 1 al 15 de septiembre sigue andando', () => {
    const v = parsearVentana('del 1 al 15 de septiembre', opt);
    expect([v.desde, v.hasta]).to.eql(['2026-09-01', '2026-09-15']);
  });
});

describe('formato de plata (sin float)', () => {
  it('es-AR, sin decimales si son ,00', () => {
    expect(moneda('1234567.00')).to.equal('$ 1.234.567');
    expect(moneda('1234567.5')).to.equal('$ 1.234.567,50');
    expect(moneda('0')).to.equal('$ 0');
    expect(moneda('-1500.25')).to.equal('-$ 1.500,25');
  });
  it('no pierde precisión en montos grandes', () => {
    expect(moneda('9007199254740993.01')).to.equal('$ 9.007.199.254.740.993,01');
  });
  it('valor no numérico → error, nunca un monto inventado', () => {
    expect(() => moneda('abc')).to.throw();
  });
  it('variación porcentual', () => {
    expect(variacion('150', '100')).to.equal('+50 %');
    expect(variacion('50', '100')).to.equal('-50 %');
    expect(variacion('10', '0')).to.equal(null);
  });
});

describe('catálogo', () => {
  it('pasa validarCatalogo y todo intent con datos declara módulo y permiso', () => {
    for (const i of CATALOGO) if (!i.publico) { expect(i.modulo).to.be.a('string'); expect(i.permiso).to.match(/\.list$/); }
  });
  it('buscarProductos: plural/singular y tildes', () => {
    const prods = [{ id: 1, nombre: 'Hamburguesa Completa' }, { id: 2, nombre: 'Papas fritas' }, { id: 3, nombre: 'Café' }];
    expect(_internos.buscarProductos('hamburguesas', prods).map((p) => p.id)).to.eql([1]);
    expect(_internos.buscarProductos('papa', prods).map((p) => p.id)).to.eql([2]);
    expect(_internos.buscarProductos('cafes', prods).map((p) => p.id)).to.eql([3]);
    expect(_internos.buscarProductos('sushi', prods)).to.eql([]);
  });
});

describe('manejarTurno', () => {
  it('ventas de hoy: monto exacto y cantidad', async () => {
    const t = sinon.stub(consultas, 'ventasTotales').resolves({ total: '54000.00', pedidos: 3, ticket: '18000.00' });
    const r = await turno('cuanto vendi hoy');
    expect(t.firstCall.args).to.eql([7, HOY, HOY]);
    expect(r).to.include({ intent: 'ventas_periodo', stage: 'ejecutor', ok: true });
    expect(r.texto).to.contain('$ 54.000').and.contain('3 pedidos').and.contain('Ticket promedio: $ 18.000');
  });

  it('sin ventas: lo dice, no muestra $ 0 como si fuera un dato', async () => {
    sinon.stub(consultas, 'ventasTotales').resolves({ total: '0', pedidos: 0, ticket: '0' });
    expect((await turno('cuanto vendi hoy')).texto).to.equal('No registraste ventas hoy.');
  });

  it('gastos: total desde SQL y desglose por tipo', async () => {
    sinon.stub(consultas, 'gastosPorTipo').resolves([{ codigo: 'SU', tipo: 'sueldos', total: '260000.00', cantidad: 5 }, { codigo: 'FI', tipo: 'fijo', total: '200000.00', cantidad: 1 }]);
    sinon.stub(consultas, 'gastosTotal').resolves('460000.00');
    sinon.stub(consultas, 'gastosPorDescripcion').resolves([{ detalle: 'alquiler', total: '200000.00' }]);
    const r = await turno('en que gaste esta semana');
    expect(r.texto).to.contain('Gastos esta semana: $ 460.000').and.contain('Sueldos: $ 260.000').and.contain('alquiler: $ 200.000');
  });

  it('sueldos: usa la ventana "mes pasado"', async () => {
    const g = sinon.stub(consultas, 'gastosPorTipo').resolves([{ codigo: 'SU', tipo: 'sueldos', total: '100000.00', cantidad: 2 }]);
    sinon.stub(consultas, 'gastosPorDescripcion').resolves([]);
    const r = await turno('cuanto pague de sueldo el mes pasado');
    expect(g.firstCall.args).to.eql([7, '2026-09-01', '2026-09-30']);
    expect(r.texto).to.contain('Sueldos el mes pasado: $ 100.000 en 2 pagos');
  });

  it('producto: busca en la carta del comercio y suma unidades', async () => {
    sinon.stub(consultas, 'productosDelComercio').resolves([{ id: 1, nombre: 'Hamburguesa' }]);
    const v = sinon.stub(consultas, 'ventasPorProductos').resolves([{ id: 1, nombre: 'Hamburguesa', unidades: 42, total: '63000.00' }]);
    const r = await turno('Cuantas hamburguesas vendí desde el 1 al 15 de este mes?');
    expect(v.firstCall.args).to.eql([7, [1], '2026-10-01', '2026-10-15']);
    expect(r.texto).to.contain('42 unidades').and.contain('$ 63.000');
  });

  it('producto inexistente: no inventa un 0', async () => {
    sinon.stub(consultas, 'productosDelComercio').resolves([{ id: 1, nombre: 'Hamburguesa' }]);
    const v = sinon.stub(consultas, 'ventasPorProductos');
    const r = await turno('cuantos sushis vendi hoy');
    expect(v.called).to.equal(false);
    expect(r.texto).to.contain('No encontré un producto');
  });

  it('comparar: mismo tramo y variación', async () => {
    const t = sinon.stub(consultas, 'ventasTotales');
    t.onCall(0).resolves({ total: '150000', pedidos: 10 });
    t.onCall(1).resolves({ total: '100000', pedidos: 8 });
    t.onCall(2).resolves({ total: '300000', pedidos: 20 });
    const r = await turno('compara las ventas de este mes con el mes pasado');
    // este mes 1–28 oct vs mes pasado 1–28 sep
    expect(t.getCall(0).args).to.eql([7, '2026-10-01', '2026-10-28']);
    expect(t.getCall(1).args).to.eql([7, '2026-09-01', '2026-09-28']);
    expect(r.texto).to.contain('+50 %').and.contain('mismo tramo').and.contain('$ 300.000');
  });

  it('caja abierta: reporta lo registrado, sin inventar un saldo', async () => {
    sinon.stub(consultas, 'cajasAbiertas').resolves([{ id: 1, fecha: '2026-10-28', caja_inicial: '20000.00', ventas: '54000.00', pedidos: 3, gastos: '5000.00' }]);
    const r = await turno('esta abierta la caja?', ctxBase({ modules: ['cerrarcaja'], permissions: { cerrarcaja: ['cerrarcaja.list'] } }));
    expect(r.intent).to.equal('estado_caja');
    expect(r.texto).to.contain('abierta (desde el 28/10)').and.contain('Inicial $ 20.000').and.contain('ventas $ 54.000 (3 pedidos)').and.contain('gastos $ 5.000');
  });

  it('caja: ninguna abierta / varias abiertas', async () => {
    const c = sinon.stub(consultas, 'cajasAbiertas');
    const ctx = ctxBase({ modules: ['cerrarcaja'], permissions: { cerrarcaja: ['cerrarcaja.list'] } });
    c.onCall(0).resolves([]);
    expect((await turno('esta abierta la caja', ctx)).texto).to.equal('No hay ninguna caja abierta ahora.');
    const fila = (fecha) => ({ id: 1, fecha, caja_inicial: '0', ventas: '0', pedidos: 0, gastos: '0' });
    c.onCall(1).resolves([fila('2026-10-28'), fila('2026-10-27')]);
    expect((await turno('esta abierta la caja', ctx)).texto).to.contain('Hay 2 cajas abiertas');
  });

  it('último cierre: con y sin monto final', async () => {
    const u = sinon.stub(consultas, 'ultimoCierre');
    const ctx = ctxBase({ modules: ['cerrarcaja'], permissions: { cerrarcaja: ['cerrarcaja.list'] } });
    u.onCall(0).resolves({ id: 2, fecha: '2026-10-27', caja_inicial: '20000.00', caja_final: '90000.50', ventas: '70000.00', pedidos: 5, gastos: '0' });
    expect((await turno('cual fue el ultimo cierre de caja', ctx)).texto).to.contain('Último cierre: 27/10').and.contain('final $ 90.000,50');
    u.onCall(1).resolves({ id: 3, fecha: '2026-10-26', caja_inicial: '0', caja_final: null, ventas: '0', pedidos: 0, gastos: '0' });
    expect((await turno('ultimo cierre', ctx)).texto).to.contain('sin monto final registrado');
    u.onCall(2).resolves(null);
    expect((await turno('ultimo cierre', ctx)).texto).to.contain('Todavía no hay cierres');
  });

  it('caja exige cerrarcaja.list: un usuario sin él no ve nada', async () => {
    const c = sinon.stub(consultas, 'cajasAbiertas');
    const r = await turno('esta abierta la caja');
    expect(c.called).to.equal(false);
    expect(r.stage).to.equal('negado_modulo');
  });

  it('fecha inválida: pide corregirla y no consulta', async () => {
    const t = sinon.stub(consultas, 'ventasTotales');
    const r = await turno('cuanto vendi el 31 de septiembre');
    expect(t.called).to.equal(false);
    expect(r.texto).to.contain('No pude entender la fecha');
  });

  it('fecha futura: no consulta', async () => {
    const t = sinon.stub(consultas, 'ventasTotales');
    const r = await turno('cuanto vendi mañana');
    expect(t.called).to.equal(false);
    expect(r.texto).to.contain('todavía no llegó');
  });

  it('usuario sin permiso: negativa sin datos y SIN ejecutar la consulta', async () => {
    const t = sinon.stub(consultas, 'ventasTotales');
    const r = await turno('cuanto vendi hoy', ctxBase({ modules: ['operaciones'], permissions: {} }));
    expect(t.called).to.equal(false);
    expect(r).to.include({ intent: 'ventas_periodo', stage: 'negado_modulo', ok: true });
    expect(r.texto).to.not.match(/\$/);
  });

  it('plan sin la feature: negativa de plan', async () => {
    const t = sinon.stub(consultas, 'ventasTotales');
    const r = await turno('cuanto vendi hoy', ctxBase({ features: { canUseReports: false } }));
    expect(t.called).to.equal(false);
    expect(r.stage).to.equal('negado_plan');
  });

  it('plan vencido: negativa de plan', async () => {
    sinon.stub(consultas, 'ventasTotales');
    expect((await turno('cuanto vendi hoy', ctxBase({ isExpired: true }))).stage).to.equal('negado_plan');
  });

  it('gastos piden gasto.list, no reportes.list', async () => {
    const t = sinon.stub(consultas, 'gastosPorTipo');
    const r = await turno('en que gaste hoy', ctxBase({ permissions: { reportes: ['reportes.list'], gasto: [] } }));
    expect(t.called).to.equal(false);
    expect(r.stage).to.equal('negado_permiso');
  });

  it('rubro sin catálogo (educación): mensaje fijo, sin consultas', async () => {
    const t = sinon.stub(consultas, 'ventasTotales');
    const r = await turno('cuanto vendi hoy', ctxBase({ rubroCodigo: 'educacion' }));
    expect(t.called).to.equal(false);
    expect(r.intent).to.equal('sin_catalogo');
  });

  it('no entendido: fallback con ejemplos', async () => {
    const r = await turno('blabla');
    expect(r).to.include({ intent: 'no_entendido', stage: 'router' });
    expect(r.texto).to.contain('Podés preguntarme');
  });

  it('saludo: ayuda sin consultar nada ni exigir permisos', async () => {
    const r = await turno('Holaaa', ctxBase({ modules: [], permissions: {} }));
    expect(r.intent).to.equal('ayuda');
  });

  it('un error del ejecutor sube (canalesService lo registra en turn_log)', async () => {
    sinon.stub(consultas, 'ventasTotales').rejects(new Error('db caída'));
    let err; try { await turno('cuanto vendi hoy'); } catch (e) { err = e; }
    expect(err.message).to.equal('db caída');
  });
});

describe('mensajesInternos.responder', () => {
  it('delega en el harness con el cliente y el usuario del vínculo', async () => {
    const ctxMod = require('../services/harness/core/contexto');
    sinon.stub(ctxMod, 'cargarContexto').resolves(ctxBase());
    // manejarTurno ya tomó la referencia original: se prueba por el camino real stubbeando planService/userService
    const planService = require('../services/cliente/planService');
    const userService = require('../services/user/userService');
    sinon.stub(planService, 'getClienteTierAndFeatures').resolves({
      rubroCodigo: 'gastronomia', tierCode: 'PREMIUM', features: { canUseReports: true }, isExpired: false, timezone: 'America/Argentina/Cordoba',
    });
    sinon.stub(userService, 'buildSessionUser').resolves({ modules: ['reportes'], permissions: { reportes: ['reportes.list'] } });
    sinon.stub(consultas, 'ventasTotales').resolves({ total: '1000', pedidos: 1, ticket: '1000' });
    const r = await mensajesInternos.responder({ clienteId: 7, usuario: { user_id: 21 }, comercio: 'X', texto: 'cuanto vendi hoy' });
    expect(consultas.ventasTotales.firstCall.args[0]).to.equal(7);
    expect(r).to.include({ intent: 'ventas_periodo', ok: true });
    expect(r.texto).to.contain('$ 1.000');
  });
});

describe('aislamiento: toda consulta del harness filtra por cliente_id ($1)', () => {
  const llamadas = {
    ventasTotales: [7, '2026-10-01', '2026-10-28'],
    ventasMejorDia: [7, '2026-10-01', '2026-10-28'],
    productosDelComercio: [7],
    ventasPorProductos: [7, [1], '2026-10-01', '2026-10-28'],
    gastosPorTipo: [7, '2026-10-01', '2026-10-28'],
    gastosTotal: [7, '2026-10-01', '2026-10-28'],
    gastosPorDescripcion: [7, '2026-10-01', '2026-10-28'],
    clientesNuevos: [7, '2026-10-01', '2026-10-28'],
    cajasAbiertas: [7],
    ultimoCierre: [7],
  };

  it('cubre todas las funciones exportadas (una consulta nueva sin caso acá rompe el test)', () => {
    expect(Object.keys(consultas).sort()).to.eql(Object.keys(llamadas).sort());
  });

  for (const [fn, args] of Object.entries(llamadas)) {
    it(`${fn}: cliente_id = $1 y $1 es el cliente del turno`, async () => {
      const q = sinon.stub(pool, 'query').resolves({ rows: [{ nuevos: 0 }] });
      await consultas[fn](...args);
      for (const call of q.getCalls()) {
        expect(call.args[0]).to.match(/cliente_id\s*=\s*\$1\b/);
        expect(call.args[1][0]).to.equal(7);
      }
      expect(q.called).to.equal(true);
    });
  }
});
