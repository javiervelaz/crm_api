/**
 * harnessCore.test.js — paso 5 (parte 1): ventana temporal y autorización
 */
const sinon = require('sinon');

const { parsearVentana, ventanaODefault } = require('../services/harness/core/ventana');
const { normalizar } = require('../services/harness/core/normalizar');
const { autorizar, validarCatalogo } = require('../services/harness/core/autorizacion');
const { cargarContexto } = require('../services/harness/core/contexto');
const planService = require('../services/cliente/planService');
const userRoleDb = require('../model/user_rol/db');
const moduloRolDb = require('../model/modulo_rol/db');
const permisosDb = require('../model/permisos/db');

let expect;
before(async () => { ({ expect } = await import('chai')); });
afterEach(() => sinon.restore());

const HOY = '2026-10-27'; // martes
const v = (texto, hoy = HOY) => parsearVentana(texto, { hoy });
const rango = (texto, hoy = HOY) => { const r = v(texto, hoy); return r && !r.invalida ? [r.desde, r.hasta] : r; };

describe('normalizar', () => {
  it('minúsculas, sin tildes ni signos, espacios simples', () => {
    expect(normalizar('  ¿Cuánto   VENDÍ hoy?! ')).to.equal('cuanto vendi hoy');
    expect(normalizar(null)).to.equal('');
  });
});

describe('ventana — expresiones relativas', () => {
  const casos = [
    ['¿cuánto vendí hoy?', HOY, HOY],
    ['y ayer?', '2026-10-26', '2026-10-26'],
    ['anteayer', '2026-10-25', '2026-10-25'],
    ['antes de ayer', '2026-10-25', '2026-10-25'],
    ['esta semana', '2026-10-26', HOY],        // lunes → hoy
    ['en la semana', '2026-10-26', HOY],
    ['la semana pasada', '2026-10-19', '2026-10-25'],
    ['la última semana', '2026-10-21', HOY],   // 7 días corridos
    ['este mes', '2026-10-01', HOY],
    ['en lo que va del mes', '2026-10-01', HOY],
    ['el mes pasado', '2026-09-01', '2026-09-30'],
    ['los últimos tres días', '2026-10-25', HOY],
    ['ultimos 10 dias', '2026-10-18', HOY],
    ['este año', '2026-01-01', HOY],
    ['el año pasado', '2025-01-01', '2025-12-31'],
    ['esta mañana', HOY, HOY],                 // hoy a la mañana, no mañana
  ];
  for (const [texto, desde, hasta] of casos) {
    it(`"${texto}" → ${desde}..${hasta}`, () => expect(rango(texto)).to.deep.equal([desde, hasta]));
  }
});

describe('ventana — fechas nombradas', () => {
  const casos = [
    ['del 1 al 15', '2026-10-01', '2026-10-15'],
    ['del 1 al 15 de septiembre', '2026-09-01', '2026-09-15'],
    ['del 01/10 al 15/10', '2026-10-01', '2026-10-15'],
    ['el 5', '2026-10-05', '2026-10-05'],
    ['el 30', '2026-09-30', '2026-09-30'],      // el 30 de este mes todavía no llegó → el del mes pasado
    ['el 5 de octubre', '2026-10-05', '2026-10-05'],
    ['15/10', '2026-10-15', '2026-10-15'],
    ['septiembre', '2026-09-01', '2026-09-30'],
    ['en diciembre', '2025-12-01', '2025-12-31'], // todavía no llegó este año → el pasado
    ['octubre', '2026-10-01', HOY],             // mes en curso: hasta hoy
    ['el lunes', '2026-10-26', '2026-10-26'],
    ['el martes', '2026-10-20', '2026-10-20'],  // hoy es martes: "el martes" es el anterior
    ['el domingo pasado', '2026-10-25', '2026-10-25'],
  ];
  for (const [texto, desde, hasta] of casos) {
    it(`"${texto}" → ${desde}..${hasta}`, () => expect(rango(texto)).to.deep.equal([desde, hasta]));
  }

  it('bordes de año: semana y mes pasados en enero', () => {
    expect(rango('la semana pasada', '2026-01-02')).to.deep.equal(['2025-12-22', '2025-12-28']);
    expect(rango('el mes pasado', '2026-01-15')).to.deep.equal(['2025-12-01', '2025-12-31']);
    expect(rango('el 5', '2026-01-03')).to.deep.equal(['2025-12-05', '2025-12-05']);
  });

  it('"del 1 al 15" a mitad del rango corta en hoy', () => {
    expect(rango('del 1 al 15', '2026-10-10')).to.deep.equal(['2026-10-01', '2026-10-10']);
  });

  it('29 de febrero sólo en bisiesto', () => {
    expect(rango('29/02', '2028-03-01')).to.deep.equal(['2028-02-29', '2028-02-29']);
    expect(v('29/02', '2027-03-01').invalida).to.equal(true);
  });
});

describe('ventana — futuro, inválidas y sin ventana', () => {
  it('mañana y pasado mañana se marcan como futuro (agenda de educación)', () => {
    expect(v('qué clases tengo mañana')).to.include({ desde: '2026-10-28', futuro: true });
    expect(v('pasado mañana')).to.include({ desde: '2026-10-29', futuro: true });
  });

  it('una fecha que no existe es inválida, no otra ventana', () => {
    expect(v('el 31 de septiembre')).to.include({ invalida: true });
    expect(v('31/02')).to.include({ invalida: true });
    expect(v('del 31 al 5')).to.include({ invalida: true });
    expect(v('del 20 al 25', '2026-10-10')).to.include({ invalida: true }); // todo en el futuro
  });

  it('sin expresión temporal → null; números que no son fechas no se confunden', () => {
    expect(v('cuánto gasté en sueldos')).to.equal(null);
    expect(v('el 2 productos')).to.equal(null);
    expect(v('el 50')).to.equal(null);
  });

  it('ventanaODefault: usa el default del intent si el texto no dice nada', () => {
    expect(ventanaODefault('cuánto vendí', { hoy: HOY })).to.include({ desde: HOY, hasta: HOY, etiqueta: 'hoy' });
    expect(ventanaODefault('cuánto vendí', { hoy: HOY }, 'este mes')).to.include({ desde: '2026-10-01' });
    expect(ventanaODefault('el 31 de septiembre', { hoy: HOY })).to.include({ invalida: true });
  });

  it('sin hoy explícito usa la zona del tenant', () => {
    const r = parsearVentana('hoy', { tz: 'America/Argentina/Cordoba' });
    expect(r.desde).to.match(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ─── Autorización ─────────────────────────────────────────────────────────────
const VENTAS = { name: 'ventas_periodo', modulo: 'reportes', permiso: 'reportes.list', feature: 'canUseReports', rubros: ['gastronomia'] };
const SALIDAS = { name: 'salidas_hoy', modulo: 'gasto', permiso: 'gasto.list' };
const ctxDueno = (over = {}) => ({
  rubroCodigo: 'gastronomia', features: { canUseReports: true }, isExpired: false,
  modules: ['reportes', 'gasto', 'operaciones'],
  permissions: { reportes: ['reportes.list'], gasto: ['gasto.list'] }, ...over,
});

describe('autorizar — los tres ejes', () => {
  it('dueño con todo → ok', () => {
    expect(autorizar(VENTAS, ctxDueno())).to.deep.equal({ ok: true });
  });

  it('otro rubro → rubro', () => {
    expect(autorizar(VENTAS, ctxDueno({ rubroCodigo: 'educacion' }))).to.include({ ok: false, eje: 'rubro' });
  });

  it('plan sin la feature, o vencido → plan', () => {
    expect(autorizar(VENTAS, ctxDueno({ features: { canUseReports: false } }))).to.include({ ok: false, eje: 'plan' });
    expect(autorizar(VENTAS, ctxDueno({ isExpired: true }))).to.include({ ok: false, eje: 'plan' });
  });

  it('cajero sin el módulo reportes → modulo', () => {
    const cajero = ctxDueno({ modules: ['operaciones'], permissions: { operaciones: ['operaciones.list'] } });
    expect(autorizar(VENTAS, cajero)).to.include({ ok: false, eje: 'modulo' });
  });

  it('módulo sí, permiso de lectura no → permiso', () => {
    const r = autorizar(SALIDAS, ctxDueno({ permissions: { gasto: ['gasto.create'] } }));
    expect(r).to.include({ ok: false, eje: 'permiso' });
  });

  it('permiso global alcanza', () => {
    expect(autorizar(SALIDAS, ctxDueno({ permissions: { _global: ['gasto.list'] } }))).to.deep.equal({ ok: true });
  });

  it('la negativa no menciona números ni el dato pedido', () => {
    for (const eje of ['rubro', 'plan', 'modulo']) {
      const ctx = { rubro: ctxDueno({ rubroCodigo: 'educacion' }), plan: ctxDueno({ isExpired: true }), modulo: ctxDueno({ modules: [] }) }[eje];
      const { mensaje } = autorizar(VENTAS, ctx);
      expect(mensaje).to.not.match(/\d|\$|vendi/i);
    }
  });

  it('intent sin modulo/permiso → se niega (fail-closed); público → pasa', () => {
    expect(autorizar({ name: 'x' }, ctxDueno())).to.include({ ok: false });
    expect(autorizar({ name: 'ayuda', publico: true }, ctxDueno({ modules: [] }))).to.deep.equal({ ok: true });
  });
});

describe('validarCatalogo', () => {
  it('acepta un catálogo bien declarado', () => {
    expect(() => validarCatalogo([VENTAS, SALIDAS, { name: 'ayuda', publico: true }])).to.not.throw();
  });

  it('rechaza faltantes, duplicados y permisos de otro módulo, todos juntos', () => {
    let err;
    try {
      validarCatalogo([
        { name: 'a', modulo: 'reportes' },
        { name: 'b', modulo: 'gasto', permiso: 'reportes.list' },
        SALIDAS, SALIDAS,
        { name: 'c', modulo: 'gasto', permiso: 'gasto.list', rubros: [] },
      ]);
    } catch (e) { err = e; }
    expect(err.message).to.include('a: falta permiso');
    expect(err.message).to.include('b: el permiso reportes.list no es del módulo gasto');
    expect(err.message).to.include('salidas_hoy: duplicado');
    expect(err.message).to.include('c: rubros vacío');
  });
});

describe('cargarContexto', () => {
  it('módulos y permisos salen de buildSessionUser (la misma fuente que el JWT)', async () => {
    sinon.stub(planService, 'getClienteTierAndFeatures').resolves({
      rubroCodigo: 'gastronomia', tierCode: 'PREMIUM', features: { canUseReports: true }, isExpired: false,
      timezone: 'America/Argentina/Cordoba',
    });
    sinon.stub(userRoleDb, 'getUserRoleByUserId').resolves([{ descripcion: 'cajero' }]);
    const mods = sinon.stub(moduloRolDb, 'getUserModuloRolByUserId').resolves([{ codigo: 'operaciones' }, { codigo: 'gasto' }]);
    const perms = sinon.stub(permisosDb, 'getPermisoByUserId').resolves([
      { permiso_codigo: 'gasto.list', modulo_codigo: 'gasto', es_global: false },
      { permiso_codigo: 'operaciones.list', modulo_codigo: 'operaciones', es_global: false },
    ]);

    const ctx = await cargarContexto({ clienteId: 7, userId: 21 });

    expect(mods.firstCall.args).to.deep.equal([21, 7]);
    expect(perms.firstCall.args).to.deep.equal([21, 7]);
    expect(ctx).to.include({ clienteId: 7, userId: 21, rubroCodigo: 'gastronomia', tierCode: 'PREMIUM', isExpired: false });
    expect(ctx.modules).to.deep.equal(['operaciones', 'gasto']);
    expect(ctx.permissions).to.deep.equal({ gasto: ['gasto.list'], operaciones: ['operaciones.list'] });
    expect(ctx.hoy).to.match(/^\d{4}-\d{2}-\d{2}$/);
    // el cajero no ve ventas
    expect(autorizar(VENTAS, ctx)).to.include({ ok: false, eje: 'modulo' });
    expect(autorizar(SALIDAS, ctx)).to.deep.equal({ ok: true });
  });

  it('ids inválidos → error antes de consultar', async () => {
    const plan = sinon.stub(planService, 'getClienteTierAndFeatures');
    let e;
    try { await cargarContexto({ clienteId: 7, userId: 'x' }); } catch (err) { e = err; }
    expect(e.message).to.include('user_id inválido');
    expect(plan.called).to.equal(false);
  });
});
