/**
 * billingWebhook.test.js — webhook de MercadoPago: suscripciones, cobros
 * mensuales, pagos únicos, log de eventos y reconciliación (migración 030).
 *
 * Los payloads tienen la forma de los Webhooks de MP (type + data.id) y la
 * firma HMAC real. El GET a la API de MP se stubea con global.fetch.
 */
const request = require('supertest');
const sinon = require('sinon');
const crypto = require('crypto');

const app = require('../node');
const pool = require('../pool');
const mp = require('../services/billing/mercadoPagoService');

let expect;
before(async () => { ({ expect } = await import('chai')); });


const norm = (sql) => sql.replace(/\s+/g, ' ').trim().toUpperCase();

function firmar(dataId, rid = 'req-1') {
  const ts = String(Date.now());
  const v1 = crypto.createHmac('sha256', process.env.MP_WEBHOOK_SECRET)
    .update(`id:${String(dataId).toLowerCase()};request-id:${rid};ts:${ts};`).digest('hex');
  return { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': rid };
}

function enviar(type, id, { queryId = id } = {}) {
  return request(app)
    .post(`/api/billing/webhook?data.id=${encodeURIComponent(queryId)}`)
    .set(firmar(queryId))
    .send({ type, action: 'updated', data: { id } });
}

/** fetch de MP: mapea path → { status, body } */
function stubMp(rutas) {
  return sinon.stub(global, 'fetch').callsFake(async (url) => {
    const path = String(url).replace('https://api.mercadopago.com', '');
    const r = rutas[path];
    if (!r) return { ok: false, status: 404, json: async () => ({ message: 'not found' }) };
    const status = r.status || 200;
    return { ok: status < 400, status, json: async () => r.body };
  });
}

const SUB = { id: 10, cliente_id: 7, tier_id: 3, status: 'pending', rubro_codigo: 'gastronomia', activada_at: null };

/**
 * pool.query falso. opciones:
 *   sub          fila de billing_subscription (o null)
 *   activa       si el UPDATE ... activada_at devuelve fila (primera activación)
 *   pagoNuevo    si el INSERT en billing_pago devuelve fila
 *   subs         filas para la reconciliación
 */
function stubPool({ sub = SUB, activa = true, pagoNuevo = true, subs = [] } = {}) {
  return sinon.stub(pool, 'query').callsFake(async (sql) => {
    const q = norm(sql);
    if (q.includes('FROM BILLING_SUBSCRIPTION WHERE MP_PREAPPROVAL_ID')) return { rows: sub ? [sub] : [] };
    if (q.includes('SET ACTIVADA_AT = NOW()') && q.includes('ACTIVADA_AT IS NULL')) return { rows: activa ? [{ id: SUB.id }] : [] };
    if (q.includes('INSERT INTO BILLING_PAGO')) return { rows: pagoNuevo ? [{ id: 1 }] : [] };
    if (q.includes('SELECT MP_PREAPPROVAL_ID FROM BILLING_SUBSCRIPTION')) return { rows: subs };
    return { rows: [] };
  });
}

const llamadas = (q, texto) => q.getCalls().filter((c) => norm(c.args[0]).includes(texto));
const logs = (q) => llamadas(q, 'INSERT INTO BILLING_WEBHOOK_LOG').map((c) => c.args[1]);

describe('Billing webhook MP (migración 030)', () => {
let prevMock;
beforeEach(() => { prevMock = process.env.MP_MOCK; process.env.MP_MOCK = 'false'; });
afterEach(() => { process.env.MP_MOCK = prevMock; sinon.restore(); });

// ─────────────────────────────────────────────────────────────────────────
describe('Webhook MP — subscription_preapproval', () => {
  it('authorized por primera vez: activa la suscripción y cubre el período', async () => {
    stubMp({ '/preapproval/pre-1': { body: { id: 'pre-1', status: 'authorized' } } });
    const q = stubPool();
    const cubrir = sinon.spy(mp, 'cubrirPeriodo');

    const res = await enviar('subscription_preapproval', 'pre-1');

    expect(res.status).to.equal(200);
    expect(res.text).to.equal('OK');
    const upd = llamadas(q, 'SET STATUS = $2, MP_STATUS = $3')[0];
    expect(upd.args[1]).to.deep.equal([SUB.id, 'active', 'authorized']);
    expect(cubrir.calledOnce).to.equal(true);
    expect(cubrir.firstCall.args.slice(0, 2)).to.deep.equal([7, 3]);
    expect(llamadas(q, 'UPDATE CLIENTE')).to.have.length(1);
    expect(logs(q)[0]).to.include('activada');
  });

  it('el mismo authorized otra vez no extiende el plan (activada_at ya seteada)', async () => {
    stubMp({ '/preapproval/pre-1': { body: { status: 'authorized' } } });
    const q = stubPool({ activa: false });

    const res = await enviar('subscription_preapproval', 'pre-1');

    expect(res.text).to.equal('OK');
    expect(llamadas(q, 'UPDATE CLIENTE')).to.have.length(0);
    expect(logs(q)[0]).to.include('ya_activa');
  });

  it('cancelled: marca cancelada y NO toca el vencimiento', async () => {
    stubMp({ '/preapproval/pre-1': { body: { status: 'cancelled' } } });
    const q = stubPool({ sub: { ...SUB, status: 'active' } });

    const res = await enviar('subscription_preapproval', 'pre-1');

    expect(res.text).to.equal('OK');
    expect(llamadas(q, 'SET STATUS = $2, MP_STATUS = $3')[0].args[1]).to.deep.equal([SUB.id, 'cancelled', 'cancelled']);
    expect(llamadas(q, 'UPDATE CLIENTE')).to.have.length(0);
  });

  it('paused: marca pausada y NO toca el vencimiento', async () => {
    stubMp({ '/preapproval/pre-1': { body: { status: 'paused' } } });
    const q = stubPool({ sub: { ...SUB, status: 'active' } });
    await enviar('subscription_preapproval', 'pre-1');
    expect(llamadas(q, 'SET STATUS = $2, MP_STATUS = $3')[0].args[1][1]).to.equal('paused');
    expect(llamadas(q, 'UPDATE CLIENTE')).to.have.length(0);
  });

  it('pending (todavía no pagó): no activa', async () => {
    stubMp({ '/preapproval/pre-1': { body: { status: 'pending' } } });
    const q = stubPool();
    await enviar('subscription_preapproval', 'pre-1');
    expect(llamadas(q, 'UPDATE CLIENTE')).to.have.length(0);
  });

  it('acepta el nombre IPN "preapproval" con el mismo comportamiento', async () => {
    stubMp({ '/preapproval/pre-1': { body: { status: 'authorized' } } });
    const q = stubPool();
    const res = await enviar('preapproval', 'pre-1');
    expect(res.text).to.equal('OK');
    expect(llamadas(q, 'UPDATE CLIENTE')).to.have.length(1);
  });

  it('preapproval que Counter no tiene registrado: 200, sin cambios, queda en el log', async () => {
    stubMp({ '/preapproval/pre-x': { body: { status: 'authorized' } } });
    const q = stubPool({ sub: null });
    const res = await enviar('subscription_preapproval', 'pre-x');
    expect(res.status).to.equal(200);
    expect(llamadas(q, 'UPDATE CLIENTE')).to.have.length(0);
    expect(logs(q)[0]).to.include('sin_registro');
  });

  it('el estado sale de la API de MP, no del body del webhook', async () => {
    const f = stubMp({ '/preapproval/pre-1': { body: { status: 'cancelled' } } });
    stubPool();
    await request(app).post('/api/billing/webhook?data.id=pre-1').set(firmar('pre-1'))
      .send({ type: 'subscription_preapproval', data: { id: 'pre-1', status: 'authorized' } });
    expect(f.firstCall.args[0]).to.equal('https://api.mercadopago.com/preapproval/pre-1');
    expect(f.firstCall.args[1].headers.Authorization).to.match(/^Bearer /);
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe('Webhook MP — subscription_authorized_payment (cobro mensual)', () => {
  const ap = (over = {}) => ({
    id: 555, preapproval_id: 'pre-1', transaction_amount: 1500, status: 'processed',
    debit_date: '2026-12-04T10:00:00.000-03:00', payment: { id: 98765, status: 'approved' }, ...over,
  });

  it('approved: registra el cobro (origen suscripcion) y cubre desde la fecha de débito', async () => {
    stubMp({ '/authorized_payments/555': { body: ap() } });
    const q = stubPool({ sub: { ...SUB, status: 'active', activada_at: new Date() } });
    const cubrir = sinon.spy(mp, 'cubrirPeriodo');

    const res = await enviar('subscription_authorized_payment', '555');

    expect(res.text).to.equal('OK');
    const ins = llamadas(q, 'INSERT INTO BILLING_PAGO')[0];
    expect(ins.args[1]).to.deep.equal([7, 3, 'gastronomia', '98765', 1500, 1, 'suscripcion', 'pre-1']);
    expect(cubrir.firstCall.args[2]).to.equal('2026-12-04T10:00:00.000-03:00');
    expect(llamadas(q, 'UPDATE CLIENTE')).to.have.length(1);
    expect(logs(q)[0]).to.include('cobro_registrado');
  });

  it('el mismo cobro dos veces: ALREADY PROCESSED y no extiende', async () => {
    stubMp({ '/authorized_payments/555': { body: ap() } });
    const q = stubPool({ pagoNuevo: false });
    const res = await enviar('subscription_authorized_payment', '555');
    expect(res.text).to.equal('ALREADY PROCESSED');
    expect(llamadas(q, 'UPDATE CLIENTE')).to.have.length(0);
  });

  it('si falla cubrir el período, borra el registro del cobro y responde 500', async () => {
    stubMp({ '/authorized_payments/555': { body: ap() } });
    const q = stubPool();
    sinon.stub(mp, 'cubrirPeriodo').rejects(new Error('boom'));
    sinon.stub(console, 'error');
    const res = await enviar('subscription_authorized_payment', '555');
    expect(res.status).to.equal(500);
    expect(llamadas(q, 'DELETE FROM BILLING_PAGO')[0].args[1]).to.deep.equal(['98765']);
  });

  it('cobro rechazado: no registra ni extiende', async () => {
    stubMp({ '/authorized_payments/555': { body: ap({ status: 'recycling', payment: { id: 98765, status: 'rejected' } }) } });
    const q = stubPool();
    const res = await enviar('subscription_authorized_payment', '555');
    expect(res.text).to.equal('IGNORED');
    expect(llamadas(q, 'INSERT INTO BILLING_PAGO')).to.have.length(0);
    expect(llamadas(q, 'UPDATE CLIENTE')).to.have.length(0);
  });

  it('cobro programado todavía sin pago asociado: IGNORED', async () => {
    stubMp({ '/authorized_payments/555': { body: ap({ status: 'scheduled', payment: undefined }) } });
    const q = stubPool();
    const res = await enviar('subscription_authorized_payment', '555');
    expect(res.text).to.equal('IGNORED');
    expect(llamadas(q, 'INSERT INTO BILLING_PAGO')).to.have.length(0);
  });

  it('cobro de un preapproval que no es de Counter: no registra', async () => {
    stubMp({ '/authorized_payments/555': { body: ap() } });
    const q = stubPool({ sub: null });
    await enviar('subscription_authorized_payment', '555');
    expect(llamadas(q, 'INSERT INTO BILLING_PAGO')).to.have.length(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe('Webhook MP — payment (pago único)', () => {
  it('un payment de suscripción (sin metadata pago_unico) se ignora: lo procesa authorized_payment', async () => {
    stubMp({ '/v1/payments/777': { body: { status: 'approved', external_reference: 'cliente-7-tier-3', metadata: {} } } });
    const q = stubPool();
    const res = await enviar('payment', '777');
    expect(res.text).to.equal('IGNORED');
    expect(llamadas(q, 'INSERT INTO BILLING_PAGO')).to.have.length(0);
  });

  it('si falla la activación del plan, borra el registro del pago y responde 500 (MP reintenta)', async () => {
    stubMp({ '/v1/payments/777': { body: { status: 'approved', transaction_amount: 900, external_reference: 'cliente-7',
      metadata: { tipo: 'pago_unico', tier_id: 4, duracion_meses: 12 } } } });
    const q = stubPool();
    sinon.stub(mp, 'activateTierForCliente').rejects(new Error('column does not exist'));
    sinon.stub(console, 'error');
    const res = await enviar('payment', '777');
    expect(res.status).to.equal(500);
    const del = llamadas(q, 'DELETE FROM BILLING_PAGO')[0];
    expect(del.args[1]).to.deep.equal(['777']);
  });

  it('las queries de activación no usan columnas que no existen en cliente', async () => {
    const q = sinon.stub(pool, 'query').resolves({ rows: [{ duracion_meses: 12 }] });
    await mp.activateTierForCliente(7, 4, { meses: 12 });
    await mp.cubrirPeriodo(7, 4, new Date());
    q.getCalls().forEach((c) => expect(norm(c.args[0])).to.not.include('TIER_DOWNGRADED_AT'));
  });

  it('pago pendiente: no activa', async () => {
    stubMp({ '/v1/payments/777': { body: { status: 'pending', metadata: { tipo: 'pago_unico' } } } });
    const q = stubPool();
    const res = await enviar('payment', '777');
    expect(res.text).to.equal('IGNORED');
    expect(llamadas(q, 'UPDATE CLIENTE')).to.have.length(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe('Webhook MP — errores, firma y log', () => {
  it('id inexistente en MP (simulador del panel): 200 NOT FOUND y queda en el log', async () => {
    stubMp({});
    const q = stubPool();
    const res = await enviar('subscription_preapproval', '123456');
    expect(res.status).to.equal(200);
    expect(res.text).to.equal('NOT FOUND');
    expect(logs(q)[0]).to.include('not_found');
  });

  it('cobro mensual que MP todavía no expone (404): 500 para que MP reintente', async () => {
    stubMp({});
    const q = stubPool();
    const res = await enviar('subscription_authorized_payment', '7033623042');
    expect(res.status).to.equal(500);
    expect(res.text).to.equal('RETRY');
    expect(logs(q)[0]).to.include('not_found_reintento');
    expect(llamadas(q, 'INSERT INTO BILLING_PAGO')).to.have.length(0);
  });

  it('MP caído (5xx): responde 500 para que MP reintente', async () => {
    stubMp({ '/preapproval/pre-1': { status: 503, body: {} } });
    const q = stubPool();
    sinon.stub(console, 'error');
    const res = await enviar('subscription_preapproval', 'pre-1');
    expect(res.status).to.equal(500);
    expect(llamadas(q, 'UPDATE CLIENTE')).to.have.length(0);
    expect(logs(q)[0]).to.include('error');
  });

  it('401 de MP: el log describe el token sin exponerlo', async () => {
    const prev = process.env.MERCADOPAGO_ACCESS_TOKEN;
    process.env.MERCADOPAGO_ACCESS_TOKEN = 'TEST-1234567890-secreto\n';
    stubMp({ '/v1/payments/123456': { status: 401, body: {} } });
    const q = stubPool();
    sinon.stub(console, 'error');
    const res = await enviar('payment', '123456');
    process.env.MERCADOPAGO_ACCESS_TOKEN = prev;
    expect(res.status).to.equal(500);
    const detalle = logs(q)[0][5];
    expect(detalle).to.include('token=TEST largo=24');
    expect(detalle).to.include('salto de línea');
    expect(detalle).to.not.include('secreto');
  });

  it('describirToken: vacío, productivo limpio y con comillas', () => {
    const { describirToken } = require('../services/billing/webhookService');
    expect(describirToken(undefined)).to.equal('token=vacío');
    expect(describirToken('APP_USR-abc')).to.equal('token=APP_USR largo=11');
    expect(describirToken('"APP_USR-abc"')).to.include('comillas');
  });

  it('tipo desconocido: IGNORED y queda en el log', async () => {
    const q = stubPool();
    const res = await enviar('mp-connect', 'abc');
    expect(res.text).to.equal('IGNORED');
    expect(logs(q)[0]).to.include('ignorado');
  });

  it('si el log falla, el webhook procesa igual', async () => {
    stubMp({ '/preapproval/pre-1': { body: { status: 'authorized' } } });
    const q = stubPool();
    q.callsFake(async (sql) => {
      const s = norm(sql);
      if (s.includes('BILLING_WEBHOOK_LOG')) throw new Error('relation "billing_webhook_log" does not exist');
      if (s.includes('FROM BILLING_SUBSCRIPTION WHERE MP_PREAPPROVAL_ID')) return { rows: [SUB] };
      if (s.includes('ACTIVADA_AT IS NULL')) return { rows: [{ id: SUB.id }] };
      return { rows: [] };
    });
    sinon.stub(console, 'error');
    const res = await enviar('subscription_preapproval', 'pre-1');
    expect(res.text).to.equal('OK');
    expect(llamadas(q, 'UPDATE CLIENTE')).to.have.length(1);
  });

  it('firma con data.id en mayúsculas en la URL: MP firma en minúsculas', async () => {
    stubMp({ '/preapproval/ABC123': { body: { status: 'pending' } } });
    stubPool();
    const res = await enviar('subscription_preapproval', 'ABC123');
    expect(res.status).to.equal(200);
  });

  it('firma alterada → 401 y no procesa ni loguea', async () => {
    const f = stubMp({});
    const q = stubPool();
    const h = firmar('pre-1');
    h['x-signature'] = h['x-signature'].replace(/v1=./, (m) => (m.endsWith('a') ? 'v1=b' : 'v1=a'));
    const res = await request(app).post('/api/billing/webhook?data.id=pre-1').set(h)
      .send({ type: 'subscription_preapproval', data: { id: 'pre-1' } });
    expect(res.status).to.equal(401);
    expect(f.called).to.equal(false);
    expect(q.called).to.equal(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe('POST /api/cron/billing/reconciliar', () => {
  const cron = () => ({ Authorization: `Bearer ${process.env.CRON_SECRET}` });

  it('sin CRON_SECRET → 401', async () => {
    const res = await request(app).post('/api/cron/billing/reconciliar');
    expect(res.status).to.equal(401);
  });

  it('aplica el estado de MP a cada suscripción viva y reporta cambios y errores', async () => {
    stubMp({
      '/preapproval/pre-1': { body: { status: 'authorized' } },
      '/preapproval/pre-2': { body: { status: 'pending' } },
      // pre-3 → 404
    });
    const q = sinon.stub(pool, 'query').callsFake(async (sql, params) => {
      const s = norm(sql);
      if (s.includes('SELECT MP_PREAPPROVAL_ID FROM BILLING_SUBSCRIPTION')) {
        return { rows: [{ mp_preapproval_id: 'pre-1' }, { mp_preapproval_id: 'pre-2' }, { mp_preapproval_id: 'pre-3' }] };
      }
      if (s.includes('FROM BILLING_SUBSCRIPTION WHERE MP_PREAPPROVAL_ID')) {
        return { rows: [{ ...SUB, mp_preapproval_id: params[0] }] };
      }
      if (s.includes('ACTIVADA_AT IS NULL')) return { rows: [{ id: SUB.id }] };
      return { rows: [] };
    });

    const res = await request(app).post('/api/cron/billing/reconciliar').set(cron());

    expect(res.status).to.equal(200);
    expect(res.body.revisadas).to.equal(3);
    expect(res.body.cambios).to.deep.equal([{ preapprovalId: 'pre-1', antes: 'pending', despues: 'active', resultado: 'activada' }]);
    expect(res.body.errores).to.deep.equal([{ preapprovalId: 'pre-3', error: 'not_found' }]);
    // excluye los ids del modo mock
    expect(norm(llamadas(q, 'SELECT MP_PREAPPROVAL_ID FROM BILLING_SUBSCRIPTION')[0].args[0])).to.include("NOT LIKE 'MOCK-%'");
    expect(logs(q)).to.have.length(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe('mercadoPagoService.cubrirPeriodo', () => {
  it('fija el vencimiento como GREATEST(actual, base + 1 mes): no suma', async () => {
    const q = sinon.stub(pool, 'query').resolves({ rows: [] });
    await mp.cubrirPeriodo(7, 3, '2026-12-04T10:00:00.000-03:00');
    const sql = norm(q.firstCall.args[0]);
    expect(sql).to.include('GREATEST(');
    expect(sql).to.include("INTERVAL '1 MONTH'");
    expect(q.firstCall.args[1]).to.deep.equal([3, 7, '2026-12-04T13:00:00.000Z']);
  });

  it('fecha inválida → usa ahora', async () => {
    const q = sinon.stub(pool, 'query').resolves({ rows: [] });
    await mp.cubrirPeriodo(7, 3, 'no-es-fecha');
    expect(Number.isNaN(Date.parse(q.firstCall.args[1][2]))).to.equal(false);
  });
});
});
