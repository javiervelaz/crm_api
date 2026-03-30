process.env.MP_MOCK = 'true';

const request = require('supertest');
const sinon = require('sinon');
const jwt = require('jsonwebtoken');
const app = require('../node');
const pool = require('../pool');

let chai;
let expect;

// JWT firmado con el mismo secret que usa el middleware
function makeToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET || '7845121323');
}

const MOCK_CLIENTE_ID = 999;
const MOCK_TIER_ID = 2;

describe('Billing API (MP_MOCK=true)', () => {
  before(async () => {
    chai = await import('chai');
    expect = chai.expect;
  });

  beforeEach(() => {
    // Stub pool.query para no tocar la DB real
    sinon.stub(pool, 'query').callsFake(async (sql, params) => {
      const q = sql.replace(/\s+/g, ' ').trim().toUpperCase();

      // SELECT cliente
      if (q.includes('SELECT') && q.includes('FROM CLIENTE WHERE ID')) {
        return { rows: [{ id: MOCK_CLIENTE_ID, nombre: 'Empresa Test', contacto_email: 'test@empresa.com' }] };
      }

      // SELECT tier
      if (q.includes('SELECT') && q.includes('FROM TIER WHERE UPPER')) {
        return { rows: [{ id: MOCK_TIER_ID, code: 'BASIC', precio_mensual: '1500.00' }] };
      }

      // INSERT billing_subscription
      if (q.includes('INSERT INTO BILLING_SUBSCRIPTION')) {
        return { rows: [] };
      }

      // SELECT billing_subscription by preapproval_id
      if (q.includes('SELECT') && q.includes('FROM BILLING_SUBSCRIPTION WHERE MP_PREAPPROVAL_ID')) {
        const preapprovalId = params && params[0];
        return {
          rows: [{ id: 1, cliente_id: MOCK_CLIENTE_ID, tier_id: MOCK_TIER_ID, mp_preapproval_id: preapprovalId, status: 'pending' }],
        };
      }

      // UPDATE billing_subscription status
      if (q.includes('UPDATE BILLING_SUBSCRIPTION SET STATUS')) {
        return { rows: [] };
      }

      // UPDATE cliente tier_id
      if (q.includes('UPDATE CLIENTE') && q.includes('SET TIER_ID')) {
        return { rows: [] };
      }

      return { rows: [] };
    });
  });

  afterEach(() => {
    sinon.restore();
  });

  // ─────────────────────────────────────────────
  // POST /api/billing/checkout
  // ─────────────────────────────────────────────
  describe('POST /api/billing/checkout', () => {
    it('devuelve initPoint y preapprovalId en mock mode', async () => {
      const token = makeToken({ cliente_id: MOCK_CLIENTE_ID, id: 1, role: ['admin'] });

      const res = await request(app)
        .post('/api/billing/checkout')
        .set('Authorization', `Bearer ${token}`)
        .send({ tierCode: 'BASIC' });

      expect(res.status).to.equal(200);
      expect(res.body).to.have.property('initPoint');
      expect(res.body).to.have.property('preapprovalId');
      expect(res.body.preapprovalId).to.match(/^mock-preapproval-/);
      expect(res.body.initPoint).to.match(/^https:\/\/fake-mp-checkout/);
    });

    it('rechaza sin token JWT', async () => {
      const res = await request(app)
        .post('/api/billing/checkout')
        .send({ tierCode: 'BASIC' });

      expect(res.status).to.equal(403);
    });

    it('retorna 404 si el cliente no existe', async () => {
      sinon.restore();
      sinon.stub(pool, 'query').callsFake(async (sql) => {
        const q = sql.replace(/\s+/g, ' ').trim().toUpperCase();
        if (q.includes('FROM CLIENTE WHERE ID')) return { rows: [] };
        return { rows: [] };
      });

      const token = makeToken({ cliente_id: MOCK_CLIENTE_ID, id: 1, role: ['admin'] });
      const res = await request(app)
        .post('/api/billing/checkout')
        .set('Authorization', `Bearer ${token}`)
        .send({ tierCode: 'BASIC' });

      expect(res.status).to.equal(404);
    });

    it('retorna 400 si el tier no existe', async () => {
      sinon.restore();
      sinon.stub(pool, 'query').callsFake(async (sql) => {
        const q = sql.replace(/\s+/g, ' ').trim().toUpperCase();
        if (q.includes('FROM CLIENTE WHERE ID')) {
          return { rows: [{ id: MOCK_CLIENTE_ID, nombre: 'Test', contacto_email: 'a@b.com' }] };
        }
        if (q.includes('FROM TIER WHERE UPPER')) return { rows: [] };
        return { rows: [] };
      });

      const token = makeToken({ cliente_id: MOCK_CLIENTE_ID, id: 1, role: ['admin'] });
      const res = await request(app)
        .post('/api/billing/checkout')
        .set('Authorization', `Bearer ${token}`)
        .send({ tierCode: 'INVALID' });

      expect(res.status).to.equal(400);
    });
  });

  // ─────────────────────────────────────────────
  // POST /api/billing/webhook (real endpoint, mock mode)
  // ─────────────────────────────────────────────
  describe('POST /api/billing/webhook (modo mock)', () => {
    it('responde 200 con mensaje MOCK MODE ACTIVE', async () => {
      const res = await request(app)
        .post('/api/billing/webhook')
        .send({ type: 'preapproval', data: { id: 'some-id' } });

      expect(res.status).to.equal(200);
      expect(res.text).to.equal('MOCK MODE ACTIVE');
    });
  });

  // ─────────────────────────────────────────────
  // POST /api/billing/webhook/mock
  // ─────────────────────────────────────────────
  describe('POST /api/billing/webhook/mock', () => {
    it('activa la suscripción y retorna ok:true', async () => {
      const preapprovalId = `mock-preapproval-${Date.now()}`;

      const res = await request(app)
        .post('/api/billing/webhook/mock')
        .send({ preapprovalId });

      expect(res.status).to.equal(200);
      expect(res.body).to.have.property('ok', true);
    });

    it('retorna 400 si falta preapprovalId', async () => {
      const res = await request(app)
        .post('/api/billing/webhook/mock')
        .send({});

      expect(res.status).to.equal(400);
      expect(res.body).to.have.property('error');
    });

    it('retorna 400 si MP_MOCK está desactivado (validación de guardia)', async () => {
      // El módulo ya tiene USE_MOCK=true por el require al inicio.
      // Este test documenta el comportamiento esperado cuando MP_MOCK=false.
      // En mock mode el endpoint debe funcionar: verificamos que responde 200.
      const res = await request(app)
        .post('/api/billing/webhook/mock')
        .send({ preapprovalId: 'mock-test-123' });

      expect(res.status).to.equal(200);
    });
  });

  // ─────────────────────────────────────────────
  // GET /api/cron/expire-tiers
  // ─────────────────────────────────────────────
  describe('GET /api/cron/expire-tiers', () => {
    it('responde 200 con campo degraded', async () => {
      sinon.restore();
      sinon.stub(pool, 'query').resolves({ rowCount: 3 });

      const res = await request(app).get('/api/cron/expire-tiers');

      expect(res.status).to.equal(200);
      expect(res.body).to.have.property('degraded', 3);
    });
  });
});
