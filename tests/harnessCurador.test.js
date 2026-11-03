// tests/harnessCurador.test.js — insumo del agente curador de intents (nivel 1)
const request = require('supertest');
const sinon = require('sinon');
const pool = require('../pool');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-tests';
const app = require('../node');
const curadorDb = require('../model/harness/curador');
const { construirReporte, anonimizar, MIN_TURNOS } = require('../services/harness/curador/reporte');

let expect;
before(async () => { ({ expect } = await import('chai')); });
afterEach(() => sinon.restore());

const ahora = '2026-11-03T12:00:00.000Z';
const fila = (texto, veces, comercios, ultima = ahora) => ({ texto, veces, comercios, primera: ultima, ultima });
const stub = (no, resumen) => ({ noEntendidos: async () => no, resumen: async () => resumen });
const r = (stage, intent, turnos, comercios, extra = {}) => ({ stage, intent, turnos, comercios, fallidos: 0, con_modelo: 0, latencia_ms_prom: 50, latencia_ms_max: 80, ...extra });

describe('curador — anonimizar', () => {
  it('saca mails, teléfonos y números largos; recorta', () => {
    expect(anonimizar('mandale a juan@gmail.com o al +54 351 555-1234')).to.equal('mandale a [mail] o al [numero]');
    expect(anonimizar('x'.repeat(500))).to.have.length(160);
    expect(anonimizar('cuanto vendi el 15')).to.equal('cuanto vendi el 15'); // números cortos se conservan
  });
});

describe('curador — construirReporte', () => {
  it('ordena por cantidad de comercios y luego por veces; junta variantes de mayúsculas/signos', async () => {
    const rep = await construirReporte({ dias: 7 }, { db: stub(
      [fila('cuanto me deben?', 3, 1), fila('Cuanto me deben', 2, 2), fila('quien es mi mejor cliente', 9, 1)],
      [r('router', 'no_entendido', 14, 2), r('ejecutor', 'ventas_periodo', 100, 4)]) });
    expect(rep.preguntas_no_entendidas.map((p) => [p.texto, p.veces, p.comercios])).to.deep.equal([
      ['cuanto me deben?', 5, 2],
      ['quien es mi mejor cliente', 9, 1],
    ]);
  });

  it('marca como ya_cubierto lo que el router de hoy resuelve', async () => {
    const rep = await construirReporte({}, { db: stub([fila('cuanto vendi hoy', 4, 1), fila('cuanto me deben', 2, 1)], [r('router', 'no_entendido', 6, 1)]) });
    const por = Object.fromEntries(rep.preguntas_no_entendidas.map((p) => [p.texto, p.ya_cubierto]));
    expect(por['cuanto vendi hoy']).to.equal(true);
    expect(por['cuanto me deben']).to.equal(false);
  });

  it('con poca muestra lo dice: no hay base para proponer intents', async () => {
    const poco = await construirReporte({}, { db: stub([], [r('ejecutor', 'ventas_periodo', MIN_TURNOS - 1, 5)]) });
    expect(poco.muestra_suficiente).to.equal(false);
    const pocosComercios = await construirReporte({}, { db: stub([], [r('ejecutor', 'ventas_periodo', 500, 2)]) });
    expect(pocosComercios.muestra_suficiente).to.equal(false);
    const ok = await construirReporte({}, { db: stub([], [r('ejecutor', 'ventas_periodo', 500, 5)]) });
    expect(ok.muestra_suficiente).to.equal(true);
  });

  it('expone señales: negaciones por autorización, fallos y latencias altas', async () => {
    const rep = await construirReporte({}, { db: stub([], [
      r('negado_permiso', 'gastos_periodo', 7, 2),
      r('error', 'ventas_periodo', 3, 1, { fallidos: 3 }),
      r('ejecutor', 'ventas_producto', 40, 3, { latencia_ms_max: 9000 }),
    ]) });
    expect(rep.senales.negaciones_por_autorizacion).to.deep.equal([{ stage: 'negado_permiso', intent: 'gastos_periodo', turnos: 7, comercios: 2 }]);
    expect(rep.senales.turnos_fallidos).to.have.length(1);
    expect(rep.senales.latencia[0].intent).to.equal('ventas_producto');
  });

  it('no filtra identificadores de comercios ni usuarios y enmascara datos personales', async () => {
    const rep = await construirReporte({}, { db: stub([fila('llamar a maria al 3515551234', 1, 1)], [r('router', 'no_entendido', 1, 1)]) });
    const json = JSON.stringify(rep);
    expect(json).to.not.match(/cliente_id|user_id|external_user_id|3515551234/);
    expect(rep.preguntas_no_entendidas[0].texto).to.equal('llamar a maria al [numero]');
  });

  it('acota la ventana: inválida → 7, máximo 90', async () => {
    const dias = [];
    const db = { noEntendidos: async ({ dias: d }) => { dias.push(d); return []; }, resumen: async () => [] };
    for (const v of [undefined, 'abc', -3, 0, 2.5, 5, 9999]) await construirReporte({ dias: v }, { db });
    expect(dias).to.deep.equal([7, 7, 7, 7, 7, 5, 90]);
  });
});

describe('curador — modelo (SQL)', () => {
  it('lee sólo no_entendido del router de la vertical, agrega y no devuelve ids', async () => {
    const q = sinon.stub(pool, 'query').resolves({ rows: [] });
    await curadorDb.noEntendidos({ dias: 7 });
    const [sql, params] = q.firstCall.args;
    expect(sql).to.match(/intent = 'no_entendido' AND stage = 'router'/);
    expect(sql).to.match(/GROUP BY 1/);
    expect(sql).to.not.match(/SELECT[^;]*\b(user_id|external_user_id)\b/i);
    expect(sql).to.not.match(/\bSELECT\b[\s\S]*?\bcliente_id\s+AS\b/);
    expect(sql).to.match(/\b(SELECT|FROM)\b/).and.to.not.match(/\b(INSERT|UPDATE|DELETE)\b/i);
    expect(params).to.deep.equal(['interno', 7, 500]);
  });
});

describe('GET /api/platform/curador/reporte', () => {
  const token = process.env.PLATFORM_ADMIN_TOKEN;
  it('sin token de plataforma: 401', async () => {
    const res = await request(app).get('/api/platform/curador/reporte');
    expect(res.status).to.equal(401);
  });
  it('un JWT de usuario común no alcanza: 401', async () => {
    const res = await request(app).get('/api/platform/curador/reporte').set('Authorization', 'Bearer cualquiercosa');
    expect(res.status).to.equal(401);
  });
  it('con token de plataforma devuelve el reporte', async () => {
    sinon.stub(curadorDb, 'noEntendidos').resolves([]);
    sinon.stub(curadorDb, 'resumen').resolves([]);
    const res = await request(app).get('/api/platform/curador/reporte?dias=14').set('Authorization', `Bearer ${token}`);
    expect(res.status).to.equal(200);
    expect(res.body).to.include({ ventana_dias: 14, muestra_suficiente: false });
  });
});
