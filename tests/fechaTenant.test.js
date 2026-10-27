/**
 * fechaTenant.test.js — "hoy" y "este mes" en la zona del tenant (migración 020)
 */
const request = require('supertest');
const sinon = require('sinon');

const app = require('../node');
const pool = require('../pool');
const f = require('../utils/fechaTenant');
const planService = require('../services/cliente/planService');
const reportes = require('../model/reportes/db');
const registroDiario = require('../model/registro_diario/db');
const { requireLimit } = require('../middleware/limitMiddleware');

let expect;
before(async () => { ({ expect } = await import('chai')); });
afterEach(() => sinon.restore());

const norm = (sql) => sql.replace(/\s+/g, ' ').trim();

describe('utils/fechaTenant', () => {
  it('hoyEn: las 22:30 de Córdoba siguen siendo hoy (en UTC ya es mañana)', () => {
    const ahora = new Date('2026-10-27T01:30:00Z'); // 26/10 22:30 en Córdoba
    expect(f.hoyEn('America/Argentina/Cordoba', ahora)).to.equal('2026-10-26');
    expect(f.hoyEn('UTC', ahora)).to.equal('2026-10-27');
    expect(f.hoyEn('America/Mexico_City', ahora)).to.equal('2026-10-26');
  });

  it('esTimezoneValida', () => {
    expect(f.esTimezoneValida('America/Bogota')).to.equal(true);
    expect(f.esTimezoneValida('Mars/Base')).to.equal(false);
    expect(f.esTimezoneValida('')).to.equal(false);
    expect(f.esTimezoneValida(null)).to.equal(false);
  });

  it('los fragmentos SQL resuelven la zona del cliente del placeholder dado', () => {
    expect(f.hoySql('$2')).to.equal('(now() AT TIME ZONE (SELECT timezone FROM cliente WHERE id = $2))::date');
    expect(f.fechaLocalSql('p.created_at', '$3')).to.include("p.created_at AT TIME ZONE 'UTC' AT TIME ZONE (SELECT timezone FROM cliente WHERE id = $3)");
    expect(f.inicioMesUtcSql('$1')).to.include("date_trunc('month', now() AT TIME ZONE");
  });
});

describe('Consultas que dejaron de usar el día UTC', () => {
  it('reporte de ventas: agrupa y filtra por el día local del tenant', async () => {
    const q = sinon.stub(pool, 'query').resolves({ rows: [] });
    await reportes.getReporteVentasWithFilters({ fecha_desde: '2026-10-01', fecha_hasta: '2026-10-31', cliente_id: 7 });
    const sql = norm(q.firstCall.args[0]);
    expect(sql).to.not.include('DATE(p.created_at)');
    expect(sql).to.include("(p.created_at AT TIME ZONE 'UTC' AT TIME ZONE (SELECT timezone FROM cliente WHERE id = $3))::date BETWEEN $1 AND $2");
  });

  it('caja del día: compara contra hoy del tenant, no CURRENT_DATE', async () => {
    const q = sinon.stub(pool, 'query').resolves({ rows: [] });
    await registroDiario.getRegistrosDiarios('dia', 7);
    expect(q.firstCall.args[0]).to.not.include('CURRENT_DATE');
    expect(q.firstCall.args[0]).to.include(f.hoySql('$1'));
  });

  it('apertura de caja: la fecha la pone el servidor, se ignora la del navegador', async () => {
    const q = sinon.stub(pool, 'query').resolves({ rows: [{ id: 1 }] });
    await registroDiario.createRegistroDiario({
      fecha: '2026-10-28T01:30:00.000Z', usuario_apertura_id: 3, caja_inicial: 100, sucursal_id: 1, cliente_id: 7,
    });
    expect(q.firstCall.args[0]).to.include(f.hoySql('$6'));
    expect(q.firstCall.args[1]).to.deep.equal([3, undefined, 100, undefined, 1, 7]);
  });

  it('límite de pedidos mensuales: cuenta desde el inicio del mes local', async () => {
    sinon.stub(planService, 'getClienteTierAndFeatures').resolves({ tierCode: 'FREE', features: { maxPedidosMensuales: 50 } });
    const q = sinon.stub(pool, 'query').resolves({ rows: [{ count: '50' }] });
    const res = { status: sinon.stub().returnsThis(), json: sinon.stub() };
    const next = sinon.stub();
    await requireLimit('maxPedidosMensuales')({ user: { cliente_id: 7 } }, res, next);
    expect(q.firstCall.args[0]).to.include(f.inicioMesUtcSql('$1'));
    expect(res.status.firstCall.args[0]).to.equal(403);
    expect(next.called).to.equal(false);
  });

  it('vencimiento del plan: se calcula en SQL con la zona del tenant', async () => {
    const q = sinon.stub(pool, 'query').resolves({ rows: [{
      id: 7, nombre: 'X', tier_code: 'PREMIUM', rubro_codigo: 'gastronomia', rubro_features: {},
      tier_expiration_date: new Date('2026-10-27T00:00:00Z'), timezone: 'America/Argentina/Cordoba', vencido: false,
    }] });
    const p = await planService.getClienteTierAndFeatures(7);
    expect(norm(q.firstCall.args[0])).to.include('(c.tier_expiration_date < (now() AT TIME ZONE c.timezone)::date) AS vencido');
    expect(p.isExpired).to.equal(false);
    expect(p.timezone).to.equal('America/Argentina/Cordoba');
  });

  it('cron de vencimientos: degrada al terminar el día en la zona del comercio', async () => {
    const q = sinon.stub(pool, 'query').resolves({ rowCount: 0, rows: [] });
    const res = await request(app).get('/api/cron/expire-tiers').set('Authorization', `Bearer ${process.env.CRON_SECRET}`);
    expect(res.status).to.equal(200);
    const sql = q.getCalls().map((c) => norm(c.args[0])).find((s) => s.includes('tier_expiration_date <'));
    expect(sql).to.include('tier_expiration_date < (now() AT TIME ZONE timezone)::date');
    expect(sql).to.not.include('CURRENT_DATE');
  });

  it('cron de vencimientos: sin CRON_SECRET → 401', async () => {
    const q = sinon.stub(pool, 'query');
    const res = await request(app).get('/api/cron/expire-tiers');
    expect(res.status).to.equal(401);
    expect(q.called).to.equal(false);
  });
});
