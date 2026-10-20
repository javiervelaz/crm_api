/**
 * whatsapp.w0.test.js — Tanda W0 del plan WhatsApp
 *   W0.1 planes (CUSTOM = PREMIUM, gating reutilizable)        WA-10, WA-11
 *   W0.2 auth de servicio n8n + /internal/whatsapp              WA-01, WA-03, WA-19
 *   W0.3 /micrositio con token de handoff                       WA-02, WA-04
 *   W0.4 router whatsaap cerrado                                WA-05, WA-06, WA-07, WA-12
 */
const request = require('supertest');
const sinon = require('sinon');
const jwt = require('jsonwebtoken');

process.env.N8N_INTERNAL_TOKEN = 'test-internal-token-de-al-menos-24-chars';

const app = require('../node');
const pool = require('../pool');
const planService = require('../services/cliente/planService');
const waDb = require('../model/whatsaap/db');
const micrositioDb = require('../model/micrositio/db');
const productoService = require('../services/producto/productoService');
const operacionesDiariasService = require('../services/operaciones_diarias/operacionesDiariasService');

const INTERNAL = process.env.N8N_INTERNAL_TOKEN;
let expect;

const plan = (tierCode, { expired = false, nombre = 'Pizzería Test' } = {}) => ({
  clienteId: 7,
  clienteNombre: nombre,
  tierCode,
  features: planService.PLAN_FEATURES[tierCode] || planService.PLAN_FEATURES.FREE,
  isExpired: expired,
});

const cuenta = (over = {}) => ({
  id: 1, cliente_id: 7, wa_phone_id: '267462816451428', wa_display: '5493517723350',
  waba_id: null, verified_name: null, status: 'active', ...over,
});

const handoff = (payload = {}, opts = {}) => jwt.sign(
  { clienteId: 7, conversationId: 55, waPhoneId: '267462816451428', userPhoneE164: '5493511234567', ...payload },
  process.env.HANDOFF_JWT_SECRET,
  { issuer: 'orders-api', audience: 'pwa', expiresIn: 3600, ...opts },
);

const userJwt = (over = {}) => jwt.sign(
  { userId: 'u-1', cliente_id: 7, role: ['admin'], modules: [], permissions: {}, ...over },
  process.env.JWT_SECRET, { expiresIn: '1h' },
);

before(async () => { ({ expect } = await import('chai')); });
afterEach(() => sinon.restore());

// ═══ W0.1 ════════════════════════════════════════════════════════════════
describe('W0.1 — planes y gating', () => {
  it('CUSTOM tiene las mismas features que PREMIUM', () => {
    expect(planService.PLAN_FEATURES.CUSTOM).to.deep.equal(planService.PLAN_FEATURES.PREMIUM);
    expect(planService.PLAN_FEATURES.CUSTOM.canUseWhatsappBot).to.equal(true);
  });

  it('CUSTOM ya no cae en los límites de FREE', async () => {
    sinon.stub(pool, 'query').resolves({ rows: [{ id: 7, nombre: 'x', tier_code: 'CUSTOM', tier_expiration_date: null }] });
    const r = await planService.getClienteTierAndFeatures(7);
    expect(r.tierCode).to.equal('CUSTOM');
    expect(r.features.maxProductos).to.equal(null);
    expect(r.features.maxPedidosMensuales).to.equal(null);
  });

  it('tier desconocido → FREE con warning (no en silencio)', async () => {
    sinon.stub(pool, 'query').resolves({ rows: [{ id: 7, nombre: 'x', tier_code: 'GOLD', tier_expiration_date: null }] });
    const warn = sinon.stub(console, 'warn');
    const r = await planService.getClienteTierAndFeatures(7);
    expect(r.features).to.deep.equal(planService.PLAN_FEATURES.FREE);
    expect(warn.calledOnce).to.equal(true);
  });

  for (const tier of ['FREE', 'BASIC']) {
    it(`assertFeature: ${tier} → 403 PLAN_INACTIVE`, async () => {
      sinon.stub(planService, 'getClienteTierAndFeatures').resolves(plan(tier));
      const err = await planService.assertFeature(7, 'canUseWhatsappBot').catch((e) => e);
      expect(err.status).to.equal(403);
      expect(err.code).to.equal('PLAN_INACTIVE');
    });
  }

  it('assertFeature: PREMIUM vencido → 403', async () => {
    sinon.stub(planService, 'getClienteTierAndFeatures').resolves(plan('PREMIUM', { expired: true }));
    const err = await planService.assertFeature(7, 'canUseWhatsappBot').catch((e) => e);
    expect(err.status).to.equal(403);
  });

  for (const tier of ['PREMIUM', 'CUSTOM']) {
    it(`assertFeature: ${tier} → OK`, async () => {
      sinon.stub(planService, 'getClienteTierAndFeatures').resolves(plan(tier));
      const r = await planService.assertFeature(7, 'canUseWhatsappBot');
      expect(r.tierCode).to.equal(tier);
    });
  }
});

// ═══ W0.2 ════════════════════════════════════════════════════════════════
describe('W0.2 — /api/internal/whatsapp (n8n)', () => {
  it('sin x-internal-token → 401', async () => {
    const res = await request(app).get('/api/internal/whatsapp/resolve/267462816451428');
    expect(res.status).to.equal(401);
  });

  it('token incorrecto → 401', async () => {
    const res = await request(app).get('/api/internal/whatsapp/resolve/267462816451428')
      .set('x-internal-token', 'otro-token-cualquiera-de-24-chars-x');
    expect(res.status).to.equal(401);
  });

  it('un JWT de usuario NO sirve como credencial de servicio → 401', async () => {
    const res = await request(app).get('/api/internal/whatsapp/resolve/267462816451428')
      .set('Authorization', `Bearer ${userJwt()}`);
    expect(res.status).to.equal(401);
  });

  it('sin N8N_INTERNAL_TOKEN en el server → 503 (falla cerrado)', async () => {
    const prev = process.env.N8N_INTERNAL_TOKEN;
    delete process.env.N8N_INTERNAL_TOKEN;
    sinon.stub(console, 'error');
    const res = await request(app).get('/api/internal/whatsapp/resolve/267462816451428').set('x-internal-token', prev);
    process.env.N8N_INTERNAL_TOKEN = prev;
    expect(res.status).to.equal(503);
  });

  it('resolve de número desconocido → 404 activo:false', async () => {
    sinon.stub(waDb, 'getAccountByPhoneId').resolves(null);
    const res = await request(app).get('/api/internal/whatsapp/resolve/111111111').set('x-internal-token', INTERNAL);
    expect(res.status).to.equal(404);
    expect(res.body.activo).to.equal(false);
  });

  it('resolve nunca devuelve access_token, aunque el model lo trajera', async () => {
    sinon.stub(waDb, 'getAccountByPhoneId').resolves(cuenta({ access_token: 'EAAsecreto' }));
    sinon.stub(planService, 'getClienteTierAndFeatures').resolves(plan('PREMIUM'));
    const res = await request(app).get('/api/internal/whatsapp/resolve/267462816451428').set('x-internal-token', INTERNAL);
    expect(res.status).to.equal(200);
    expect(JSON.stringify(res.body)).to.not.include('EAAsecreto');
    expect(res.body).to.include({ cliente_id: 7, activo: true, plan_ok: true });
  });

  it('resolve de comercio FREE → activo:false, plan_ok:false', async () => {
    sinon.stub(waDb, 'getAccountByPhoneId').resolves(cuenta());
    sinon.stub(planService, 'getClienteTierAndFeatures').resolves(plan('FREE'));
    const res = await request(app).get('/api/internal/whatsapp/resolve/267462816451428').set('x-internal-token', INTERNAL);
    expect(res.body).to.include({ activo: false, plan_ok: false });
  });

  it('sign: cliente_id del body se ignora — el tenant sale del número', async () => {
    sinon.stub(waDb, 'getAccountByPhoneId').resolves(cuenta());
    sinon.stub(planService, 'getClienteTierAndFeatures').resolves(plan('CUSTOM'));
    const conv = sinon.stub(waDb, 'findOrCreateConversation').resolves(55);
    const res = await request(app).post('/api/internal/whatsapp/handoff/sign').set('x-internal-token', INTERNAL)
      .send({ wa_phone_id: '267462816451428', telefono: '5493511234567', cliente_id: 99, clienteId: 99 });
    expect(res.status).to.equal(200);
    const p = jwt.verify(res.body.token, process.env.HANDOFF_JWT_SECRET, { issuer: 'orders-api', audience: 'pwa' });
    expect(p.clienteId).to.equal(7);
    expect(p.conversationId).to.equal(55);
    expect(conv.firstCall.args[0]).to.deep.equal({ cliente_id: 7, wa_phone_id: '267462816451428', phone_e164: '5493511234567' });
    expect(res.body.url).to.match(/\/catalogo\?c=/);
    expect(res.body.url).to.include(encodeURIComponent(res.body.token));
    expect(res.body.expiresIn).to.equal(3600);
  });

  it('sign: comercio FREE → 403 PLAN_INACTIVE y no crea conversación', async () => {
    sinon.stub(waDb, 'getAccountByPhoneId').resolves(cuenta());
    sinon.stub(planService, 'getClienteTierAndFeatures').resolves(plan('FREE'));
    const conv = sinon.stub(waDb, 'findOrCreateConversation').resolves(1);
    const res = await request(app).post('/api/internal/whatsapp/handoff/sign').set('x-internal-token', INTERNAL)
      .send({ wa_phone_id: '267462816451428', telefono: '5493511234567' });
    expect(res.status).to.equal(403);
    expect(res.body.code).to.equal('PLAN_INACTIVE');
    expect(res.body).to.not.have.property('token');
    expect(conv.called).to.equal(false);
  });

  it('sign: número suspendido → 403 WA_NUMBER_INACTIVE', async () => {
    sinon.stub(waDb, 'getAccountByPhoneId').resolves(cuenta({ status: 'suspended' }));
    const res = await request(app).post('/api/internal/whatsapp/handoff/sign').set('x-internal-token', INTERNAL)
      .send({ wa_phone_id: '267462816451428', telefono: '5493511234567' });
    expect(res.status).to.equal(403);
    expect(res.body.code).to.equal('WA_NUMBER_INACTIVE');
  });

  it('sign: teléfono inválido → 400', async () => {
    sinon.stub(waDb, 'getAccountByPhoneId').resolves(cuenta());
    sinon.stub(planService, 'getClienteTierAndFeatures').resolves(plan('PREMIUM'));
    const res = await request(app).post('/api/internal/whatsapp/handoff/sign').set('x-internal-token', INTERNAL)
      .send({ wa_phone_id: '267462816451428', telefono: 'abc' });
    expect(res.status).to.equal(400);
  });

  it('sign: wa_phone_id con basura → 400 sin tocar la DB', async () => {
    const stub = sinon.stub(waDb, 'getAccountByPhoneId');
    const res = await request(app).post('/api/internal/whatsapp/handoff/sign').set('x-internal-token', INTERNAL)
      .send({ wa_phone_id: "1' OR '1'='1", telefono: '5493511234567' });
    expect(res.status).to.equal(400);
    expect(stub.called).to.equal(false);
  });
});

describe('W0.2 — /api/handoff', () => {
  it('resolve valida issuer/audience: token firmado sin aud → 401', async () => {
    const t = jwt.sign({ clienteId: 7 }, process.env.HANDOFF_JWT_SECRET, { expiresIn: 600 });
    const res = await request(app).get('/api/handoff/resolve').query({ c: t });
    expect(res.status).to.equal(401);
  });

  it('resolve con token válido → 200', async () => {
    const res = await request(app).get('/api/handoff/resolve').query({ c: handoff() });
    expect(res.status).to.equal(200);
    expect(res.body).to.include({ valid: true, clienteId: 7 });
  });
});

// ═══ W0.3 ════════════════════════════════════════════════════════════════
describe('W0.3 — /api/micrositio', () => {
  const premium = () => sinon.stub(planService, 'getClienteTierAndFeatures').resolves(plan('PREMIUM'));

  it('sin token → 401 NO_TOKEN', async () => {
    const res = await request(app).get('/api/micrositio/productos');
    expect(res.status).to.equal(401);
    expect(res.body.code).to.equal('NO_TOKEN');
  });

  it('token expirado → 401 TOKEN_EXPIRED', async () => {
    const t = jwt.sign(
      { clienteId: 7, exp: Math.floor(Date.now() / 1000) - 10 },
      process.env.HANDOFF_JWT_SECRET, { issuer: 'orders-api', audience: 'pwa' },
    );
    const res = await request(app).get('/api/micrositio/productos').set('Authorization', `Bearer ${t}`);
    expect(res.status).to.equal(401);
    expect(res.body.code).to.equal('TOKEN_EXPIRED');
  });

  it('un JWT de usuario del CRM no sirve en el micrositio → 401', async () => {
    const res = await request(app).get('/api/micrositio/productos').set('Authorization', `Bearer ${userJwt()}`);
    expect(res.status).to.equal(401);
  });

  it('comercio FREE → 403 PLAN_INACTIVE', async () => {
    sinon.stub(planService, 'getClienteTierAndFeatures').resolves(plan('FREE'));
    const res = await request(app).get('/api/micrositio/productos').set('Authorization', `Bearer ${handoff()}`);
    expect(res.status).to.equal(403);
    expect(res.body.code).to.equal('PLAN_INACTIVE');
  });

  it('productos usa el tenant del token, no el de la query', async () => {
    premium();
    const list = sinon.stub(productoService, 'getProductoListService').resolves([{ id: 1, nombre: 'Muzza', precio_unitario: '8500.00', permite_mitad: true }]);
    const res = await request(app).get('/api/micrositio/productos?cliente_id=8').set('x-handoff-token', handoff());
    expect(res.status).to.equal(200);
    expect(list.firstCall.args[0]).to.equal(7);
    expect(res.body[0]).to.include({ id: 1, precio_unitario: 8500, permite_mitad: true });
  });

  it('producto de otro comercio → 404 (el model filtra por el tenant del token)', async () => {
    premium();
    const get = sinon.stub(productoService, 'getProductoByIdService').resolves(undefined);
    const res = await request(app).get('/api/micrositio/productos/99').set('Authorization', `Bearer ${handoff()}`);
    expect(res.status).to.equal(404);
    expect(get.firstCall.args).to.deep.equal(['99', 7]);
  });

  describe('POST /pedidos', () => {
    const body = (over = {}) => ({
      nombre: 'Ana', tipo_entrega: 'delivery', direccion: 'Belgrano 123', observaciones: 'sin cebolla',
      medio_pago_id: 1, paga_efectivo: 20000, cliente_id: 99, monto_total: 1,
      items: [{ producto_id: 10, cantidad: 2, precio_unitario: 1 }, { producto_id: 11, cantidad: 1 }],
      ...over,
    });
    const setup = ({ caja = { id: 300, fecha: '2026-10-20', sucursal_id: 4, usuario_apertura_id: 21 } } = {}) => {
      premium();
      sinon.stub(micrositioDb, 'getProductosPorIds').resolves([
        { id: 10, nombre: 'Muzza', precio_unitario: '8500.00' },
        { id: 11, nombre: 'Fainá', precio_unitario: '1500.50' },
      ]);
      sinon.stub(micrositioDb, 'getMediosPago').resolves([{ id: 1, descripcion: 'Efectivo', codigo: 'EFE' }, { id: 2, descripcion: 'MP', codigo: 'MP' }]);
      sinon.stub(micrositioDb, 'getCajaAbierta').resolves(caja);
      return sinon.stub(operacionesDiariasService, 'crearPedido').resolves(777);
    };

    it('precio, tenant, sucursal, usuario, teléfono y conversación salen del servidor', async () => {
      const crear = setup();
      const res = await request(app).post('/api/micrositio/pedidos').set('Authorization', `Bearer ${handoff()}`).send(body());
      expect(res.status).to.equal(201);
      expect(res.body).to.include({ idPedido: 777, total: 18500.5, vuelto: 1499.5 });
      const d = crear.firstCall.args[0];
      expect(d).to.include({
        cliente_id: 7, monto_total: 18500.5, sucursal_id: 4, usuario_id: 21, registro_diario_id: 300,
        cliente_telefono: '5493511234567', conversation_id: 55, user_cliente_id: null,
      });
      expect(d.productos[0]).to.include({ producto_id: 10, precio_unitario: 8500, cantidad: 2 });
    });

    it('producto ajeno o inexistente → 400 PRODUCTO_INVALIDO', async () => {
      const crear = setup();
      const res = await request(app).post('/api/micrositio/pedidos').set('Authorization', `Bearer ${handoff()}`)
        .send(body({ items: [{ producto_id: 10, cantidad: 1 }, { producto_id: 12, cantidad: 1 }] }));
      expect(res.status).to.equal(400);
      expect(res.body.code).to.equal('PRODUCTO_INVALIDO');
      expect(crear.called).to.equal(false);
    });

    it('caja cerrada → 409 CAJA_CERRADA', async () => {
      setup({ caja: null });
      const res = await request(app).post('/api/micrositio/pedidos').set('Authorization', `Bearer ${handoff()}`).send(body());
      expect(res.status).to.equal(409);
      expect(res.body.code).to.equal('CAJA_CERRADA');
    });

    it('efectivo menor al total → 400', async () => {
      setup();
      const res = await request(app).post('/api/micrositio/pedidos').set('Authorization', `Bearer ${handoff()}`)
        .send(body({ paga_efectivo: 100 }));
      expect(res.status).to.equal(400);
    });

    it('cantidad absurda → 400', async () => {
      setup();
      const res = await request(app).post('/api/micrositio/pedidos').set('Authorization', `Bearer ${handoff()}`)
        .send(body({ items: [{ producto_id: 10, cantidad: 1000 }] }));
      expect(res.status).to.equal(400);
    });

    it('delivery sin dirección → 400', async () => {
      setup();
      const res = await request(app).post('/api/micrositio/pedidos').set('Authorization', `Bearer ${handoff()}`)
        .send(body({ direccion: '' }));
      expect(res.status).to.equal(400);
    });

    it('medio digital: no guarda efectivo ni vuelto', async () => {
      const crear = setup();
      const res = await request(app).post('/api/micrositio/pedidos').set('Authorization', `Bearer ${handoff()}`)
        .send(body({ medio_pago_id: 2, tipo_entrega: 'pickup', direccion: '' }));
      expect(res.status).to.equal(201);
      expect(crear.firstCall.args[0]).to.include({ paga_efectivo: 0, vuelto_pago_efectivo: 0, cliente_casa_nro: '' });
    });
  });
});

// ═══ W0.4 ════════════════════════════════════════════════════════════════
describe('W0.4 — /api/whatsaap (panel del CRM)', () => {
  it('rutas viejas con :cliente_id ya no existen → 404', async () => {
    sinon.stub(planService, 'getClienteTierAndFeatures').resolves(plan('PREMIUM'));
    const res = await request(app).get('/api/whatsaap/accounts/8').set('Authorization', `Bearer ${userJwt()}`);
    expect(res.status).to.equal(404);
  });

  it('/resolve público con access_token ya no existe → 404', async () => {
    sinon.stub(planService, 'getClienteTierAndFeatures').resolves(plan('PREMIUM'));
    const res = await request(app).get('/api/whatsaap/resolve/267462816451428').set('Authorization', `Bearer ${userJwt()}`);
    expect(res.status).to.equal(404);
  });

  it('accounts lista las del tenant del JWT, sin access_token', async () => {
    sinon.stub(planService, 'getClienteTierAndFeatures').resolves(plan('PREMIUM'));
    const s = sinon.stub(waDb, 'getWhatsappByClienteId').resolves([cuenta()]);
    const res = await request(app).get('/api/whatsaap/accounts').set('Authorization', `Bearer ${userJwt()}`);
    expect(res.status).to.equal(200);
    expect(s.firstCall.args[0]).to.equal(7);
    expect(res.body[0]).to.not.have.property('access_token');
  });

  it('comercio FREE → 403 PLAN_INACTIVE', async () => {
    sinon.stub(planService, 'getClienteTierAndFeatures').resolves(plan('FREE'));
    const res = await request(app).get('/api/whatsaap/accounts').set('Authorization', `Bearer ${userJwt()}`);
    expect(res.status).to.equal(403);
    expect(res.body.code).to.equal('PLAN_INACTIVE');
  });

  it('send/text con número de otro comercio → 403 WA_NUMBER_FORBIDDEN, sin llamar a Meta', async () => {
    sinon.stub(planService, 'getClienteTierAndFeatures').resolves(plan('PREMIUM'));
    sinon.stub(waDb, 'getSendCredentials').resolves(null);
    const f = sinon.stub(global, 'fetch');
    const res = await request(app).post('/api/whatsaap/send/text').set('Authorization', `Bearer ${userJwt()}`)
      .send({ phone_number_id: '1014204655111073', to: '5493511234567', body: 'hola' });
    expect(res.status).to.equal(403);
    expect(res.body.code).to.equal('WA_NUMBER_FORBIDDEN');
    expect(f.called).to.equal(false);
  });

  it('send/text con número propio usa SU token y no lo devuelve', async () => {
    sinon.stub(planService, 'getClienteTierAndFeatures').resolves(plan('PREMIUM'));
    const cred = sinon.stub(waDb, 'getSendCredentials').resolves({ wa_phone_id: '267462816451428', access_token: 'EAAdelComercio' });
    const f = sinon.stub(global, 'fetch').resolves({ ok: true, json: async () => ({ messages: [{ id: 'wamid.1' }] }) });
    const res = await request(app).post('/api/whatsaap/send/text').set('Authorization', `Bearer ${userJwt()}`)
      .send({ phone_number_id: '267462816451428', to: '5493511234567', body: 'hola', cliente_id: 7 });
    expect(res.status).to.equal(200);
    expect(cred.firstCall.args).to.deep.equal([7, '267462816451428']);
    expect(f.firstCall.args[1].headers.Authorization).to.equal('Bearer EAAdelComercio');
    expect(JSON.stringify(res.body)).to.not.include('EAA');
  });

  it('request-code y activate (flujo SMS viejo) → 410', async () => {
    sinon.stub(planService, 'getClienteTierAndFeatures').resolves(plan('PREMIUM'));
    for (const p of ['/api/whatsaap/request-code', '/api/whatsaap/activate']) {
      const res = await request(app).post(p).set('Authorization', `Bearer ${userJwt()}`).send({});
      expect(res.status).to.equal(410);
    }
  });
});
