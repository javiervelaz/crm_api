/**
 * tiersPorRubro.test.js — features y precios por rubro (migración 019)
 */
const request = require('supertest');
const sinon = require('sinon');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const app = require('../node');
const pool = require('../pool');
const planService = require('../services/cliente/planService');
const mp = require('../services/billing/mercadoPagoService');

let expect;
before(async () => { ({ expect } = await import('chai')); });
afterEach(() => sinon.restore());

const norm = (sql) => sql.replace(/\s+/g, ' ').trim().toUpperCase();
const token = (over = {}) => jwt.sign({ userId: 1, cliente_id: 7, role: ['admin'], ...over }, process.env.JWT_SECRET, { expiresIn: '1h' });
const ofertaRow = (over = {}) => ({
  tier_id: 3, id: 3, code: 'PREMIUM', nombre: 'Premium', nombre_publico: 'Premium', descripcion: 'x',
  es_personalizado: false, es_activo: true, rubro_codigo: 'gastronomia',
  precio_mensual: '150.00', duracion_meses: 1, disponible: true, features: {}, ...over,
});

describe('Tiers por rubro — features', () => {
  it('mismo tier, distinto rubro → distintas features (rubro_tier pisa los defaults)', async () => {
    const q = sinon.stub(pool, 'query');
    q.onFirstCall().resolves({ rows: [{ id: 7, nombre: 'Pizzería', tier_code: 'PREMIUM', rubro_codigo: 'gastronomia', rubro_features: { canUsePedidosOnline: true } }] });
    q.onSecondCall().resolves({ rows: [{ id: 8, nombre: 'Academia', tier_code: 'PREMIUM', rubro_codigo: 'educacion', rubro_features: { canUsePedidosOnline: false, canUseReports: false } }] });
    const g = await planService.getClienteTierAndFeatures(7);
    const e = await planService.getClienteTierAndFeatures(8);
    expect(g.features.canUsePedidosOnline).to.equal(true);
    expect(e.features.canUsePedidosOnline).to.equal(false);
    expect(e.features.canUseReports).to.equal(false);
    expect(e.features.canUseBot).to.equal(true); // default del tier, no lo pisó el rubro
    expect(e.rubroCodigo).to.equal('educacion');
  });

  it('sin fila en rubro_tier → defaults del tier, avisa una sola vez', async () => {
    sinon.stub(pool, 'query').resolves({ rows: [{ id: 9, nombre: 'X', tier_code: 'BASIC', rubro_codigo: 'nuevo_rubro', rubro_features: null }] });
    const warn = sinon.stub(console, 'warn');
    const a = await planService.getClienteTierAndFeatures(9);
    await planService.getClienteTierAndFeatures(9);
    expect(a.features).to.deep.equal(planService.PLAN_FEATURES.BASIC);
    expect(warn.callCount).to.equal(1);
  });
});

describe('GET /api/tiers?rubro=', () => {
  it('devuelve precio, disponibilidad y features del rubro pedido', async () => {
    const q = sinon.stub(pool, 'query').resolves({ rows: [
      ofertaRow({ code: 'FREE', tier_id: 1, id: 1, rubro_codigo: 'educacion', precio_mensual: '0.00', disponible: true, features: { canUsePedidosOnline: false } }),
      ofertaRow({ rubro_codigo: 'educacion', precio_mensual: '0.00', disponible: false, features: { canUsePedidosOnline: false } }),
    ] });
    const res = await request(app).get('/api/tiers?rubro=educacion');
    expect(res.status).to.equal(200);
    expect(q.firstCall.args[1]).to.deep.equal(['educacion']);
    expect(res.body[1]).to.include({ code: 'PREMIUM', precio_mensual: 0, disponible: false, rubro_codigo: 'educacion' });
    expect(res.body[1].features.canUsePedidosOnline).to.equal(false);
  });

  it('sin rubro → gastronomía; rubro con basura → 400', async () => {
    const q = sinon.stub(pool, 'query').resolves({ rows: [] });
    await request(app).get('/api/tiers');
    expect(q.firstCall.args[1]).to.deep.equal(['gastronomia']);
    const bad = await request(app).get('/api/tiers?rubro=x%27%3B--');
    expect(bad.status).to.equal(400);
  });
});

describe('POST /api/billing/checkout — precio del rubro', () => {
  const stubDb = (oferta) => sinon.stub(pool, 'query').callsFake(async (sql) => {
    const q = norm(sql);
    if (q.includes('FROM CLIENTE WHERE ID')) return { rows: [{ id: 7, nombre: 'Academia', contacto_email: 'a@b.com', rubro_codigo: 'educacion' }] };
    if (q.includes('JOIN RUBRO_TIER')) return { rows: oferta ? [oferta] : [] };
    if (q.includes('INSERT INTO BILLING_SUBSCRIPTION')) return { rows: [] };
    return { rows: [] };
  });

  it('cobra el precio del rubro y guarda el snapshot', async () => {
    const db = stubDb(ofertaRow({ rubro_codigo: 'educacion', precio_mensual: '25000.00' }));
    const sub = sinon.stub(mp, 'createSubscription').resolves({ initPoint: 'https://mp/x', preapprovalId: 'pre-1' });
    const res = await request(app).post('/api/billing/checkout').set('Authorization', `Bearer ${token()}`)
      .send({ tierCode: 'premium', paymentType: 'subscription' });
    expect(res.status).to.equal(200);
    expect(sub.firstCall.args[1]).to.include({ precio_mensual: 25000, rubro_codigo: 'educacion', id: 3 });
    const ofertaQ = db.getCalls().find((c) => norm(c.args[0]).includes('JOIN RUBRO_TIER'));
    expect(ofertaQ.args[1]).to.deep.equal(['educacion', 'premium']);
    const ins = db.getCalls().find((c) => norm(c.args[0]).includes('INSERT INTO BILLING_SUBSCRIPTION'));
    expect(ins.args[1]).to.deep.equal([7, 3, 'pre-1', 'educacion', 25000, 1]);
  });

  it('plan no disponible en el rubro → 400 PLAN_NO_DISPONIBLE, sin llamar a MP', async () => {
    stubDb(ofertaRow({ rubro_codigo: 'educacion', precio_mensual: '0.00', disponible: false }));
    const sub = sinon.stub(mp, 'createSubscription');
    const res = await request(app).post('/api/billing/checkout').set('Authorization', `Bearer ${token()}`)
      .send({ tierCode: 'PREMIUM', paymentType: 'subscription' });
    expect(res.status).to.equal(400);
    expect(res.body.code).to.equal('PLAN_NO_DISPONIBLE');
    expect(sub.called).to.equal(false);
  });

  it('disponible pero a $0 → 400 PLAN_SIN_COSTO (nunca un preapproval de $0)', async () => {
    stubDb(ofertaRow({ precio_mensual: '0.00', disponible: true }));
    const pay = sinon.stub(mp, 'createOneTimePayment');
    const res = await request(app).post('/api/billing/checkout').set('Authorization', `Bearer ${token()}`)
      .send({ tierCode: 'PREMIUM' });
    expect(res.status).to.equal(400);
    expect(res.body.code).to.equal('PLAN_SIN_COSTO');
    expect(pay.called).to.equal(false);
  });

  it('cómo se cobra lo decide la duración, no el body', async () => {
    stubDb(ofertaRow({ precio_mensual: '200.00', duracion_meses: 1 }));
    const sub = sinon.stub(mp, 'createSubscription').resolves({ initPoint: 'https://mp/x', preapprovalId: 'pre-2' });
    const pay = sinon.stub(mp, 'createOneTimePayment');
    const res = await request(app).post('/api/billing/checkout').set('Authorization', `Bearer ${token()}`)
      .send({ tierCode: 'PREMIUM', paymentType: 'one_time' });
    expect(res.status).to.equal(200);
    expect(sub.calledOnce).to.equal(true);
    expect(pay.called).to.equal(false);
  });

  it('12 meses → pago único aunque el body pida suscripción', async () => {
    stubDb(ofertaRow({ code: 'CUSTOM', precio_mensual: '1200.00', duracion_meses: 12 }));
    const sub = sinon.stub(mp, 'createSubscription');
    const pay = sinon.stub(mp, 'createOneTimePayment').resolves({ initPoint: 'https://mp/p', paymentId: 'p-1' });
    const res = await request(app).post('/api/billing/checkout').set('Authorization', `Bearer ${token()}`)
      .send({ tierCode: 'CUSTOM', paymentType: 'subscription' });
    expect(res.status).to.equal(200);
    expect(pay.calledOnce).to.equal(true);
    expect(sub.called).to.equal(false);
  });

  it('tier desactivado → no disponible aunque rubro_tier diga disponible', async () => {
    stubDb(ofertaRow({ es_activo: false, disponible: true }));
    const res = await request(app).post('/api/billing/checkout').set('Authorization', `Bearer ${token()}`)
      .send({ tierCode: 'PREMIUM' });
    expect(res.body.code).to.equal('PLAN_NO_DISPONIBLE');
  });
});

describe('planService.tipoDePago / esPagable', () => {
  it('1 mes → subscription; > 1 → one_time', () => {
    expect(planService.tipoDePago({ duracion_meses: 1 })).to.equal('subscription');
    expect(planService.tipoDePago({ duracion_meses: 12 })).to.equal('one_time');
    expect(planService.tipoDePago({})).to.equal('subscription');
  });
  it('disponible a $0 no es pagable (sería un plan pago gratis)', () => {
    expect(planService.esPagable({ disponible: true, precio_mensual: 0 })).to.equal(false);
    expect(planService.esPagable({ disponible: false, precio_mensual: 200 })).to.equal(false);
    expect(planService.esPagable({ disponible: true, precio_mensual: 200 })).to.equal(true);
    expect(planService.esPagable(null)).to.equal(false);
  });
});

describe('Webhook de pago único — idempotente', () => {
  const firmar = (dataId) => {
    const ts = String(Date.now());
    const rid = 'req-1';
    const v1 = crypto.createHmac('sha256', process.env.MP_WEBHOOK_SECRET)
      .update(`id:${dataId};request-id:${rid};ts:${ts};`).digest('hex');
    return { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': rid };
  };
  const pago = { status: 'approved', transaction_amount: 500, external_reference: 'cliente-7',
    metadata: { tipo: 'pago_unico', tier_id: 4, duracion_meses: 12, rubro_codigo: 'gastronomia', precio: 500 } };

  const enviar = () => request(app).post('/api/billing/webhook?data.id=pay-1').set(firmar('pay-1'))
    .send({ type: 'payment', data: { id: 'pay-1' } });

  it('primer aviso: registra el pago y activa 12 meses', async () => {
    const prev = process.env.MP_MOCK; process.env.MP_MOCK = 'false';
    sinon.stub(global, 'fetch').resolves({ json: async () => pago });
    const q = sinon.stub(pool, 'query').callsFake(async (sql) => (norm(sql).includes('INSERT INTO BILLING_PAGO') ? { rows: [{ id: 1 }] } : { rows: [] }));
    const res = await enviar();
    process.env.MP_MOCK = prev;
    expect(res.text).to.equal('OK');
    const ins = q.getCalls().find((c) => norm(c.args[0]).includes('INSERT INTO BILLING_PAGO'));
    expect(ins.args[1]).to.deep.equal(['7', 4, 'gastronomia', 'pay-1', 500, 12]);
    expect(q.getCalls().some((c) => norm(c.args[0]).includes('UPDATE CLIENTE'))).to.equal(true);
  });

  it('reintento del mismo pago: no extiende el plan otra vez', async () => {
    const prev = process.env.MP_MOCK; process.env.MP_MOCK = 'false';
    sinon.stub(global, 'fetch').resolves({ json: async () => pago });
    const q = sinon.stub(pool, 'query').resolves({ rows: [] }); // ON CONFLICT DO NOTHING → sin RETURNING
    const res = await enviar();
    process.env.MP_MOCK = prev;
    expect(res.text).to.equal('ALREADY PROCESSED');
    expect(q.getCalls().some((c) => norm(c.args[0]).includes('UPDATE CLIENTE'))).to.equal(false);
  });
});
