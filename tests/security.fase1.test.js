/**
 * security.fase1.test.js
 *
 * Tests de seguridad para los cambios de Fase 1:
 * 1. Autenticación obligatoria en endpoints anteriormente expuestos
 * 2. Rate limiting en el endpoint de login
 * 3. Verificación de firma HMAC en webhook de MercadoPago
 * 4. Endpoint handoff/sign requiere autenticación
 */

const request = require('supertest');
const sinon = require('sinon');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

// Fijar MP_MOCK=false antes de cargar la app para que el webhook
// ejecute la validación de firma y no retorne inmediatamente
process.env.MP_MOCK = 'false';
process.env.MP_WEBHOOK_SECRET = 'test-webhook-secret-fase1';

const app = require('../node');

// Servicios que necesitamos stubear para no tocar la DB
const clienteService    = require('../services/cliente/clienteService');
const rolService        = require('../services/rol/rolService');
const operacionesService = require('../services/operaciones_diarias/operacionesDiariasService');
const planService       = require('../services/cliente/planService');
const pool              = require('../pool');

let chai, expect;

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Genera un JWT con todos los claims necesarios para pasar
 * authenticateJWT + authorizeRole + authorizeModule + authorizePermission.
 */
function makeAdminToken(overrides = {}) {
  return jwt.sign(
    {
      userId:      'test-user-id',
      cliente_id:  1,
      username:    'test',
      sucursal:    1,
      role:        ['admin'],
      modules:     ['operaciones', 'productos', 'usuarios', 'reportes'],
      permissions: {
        operaciones: [
          'operaciones.list',
          'operaciones.delete',
          'operaciones.create',
        ],
        productos: [
          'productos.create',
          'productos.list',
          'productos.update',
          'productos.delete',
        ],
        usuarios: [
          'usuarios.create',
          'usuarios.list',
          'usuarios.update',
          'usuarios.delete',
        ],
      },
      ...overrides,
    },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

/**
 * Genera la firma HMAC correcta para el webhook de MercadoPago.
 */
function makeMpSignature(dataId, requestId, ts, secret) {
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const hash = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
  return `ts=${ts},v1=${hash}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// Sección 1: Autenticación — 403 sin token
// ═══════════════════════════════════════════════════════════════════════════

describe('Fase 1 — Auth: 401 sin token en endpoints protegidos', () => {
  before(async () => {
    chai = await import('chai');
    expect = chai.expect;
  });

  // Tabla de rutas que deben retornar 401 sin Authorization
  const protectedRoutes = [
    { method: 'get',    path: '/api/cliente/me',                body: null },
    { method: 'put',    path: '/api/cliente/me',                body: {} },

    { method: 'post',   path: '/api/rol',                       body: {} },
    { method: 'get',    path: '/api/rol/list/any-cliente-id',   body: null },
    { method: 'get',    path: '/api/rol/any-id/any-cliente-id', body: null },
    { method: 'put',    path: '/api/rol/any-id',                body: {} },
    { method: 'delete', path: '/api/rol/any-id/any-cliente-id', body: null },

    { method: 'get',    path: '/api/registro_diario/any-id',    body: null },
    { method: 'post',   path: '/api/registro_diario',           body: {} },
    { method: 'put',    path: '/api/registro_diario/any-id',    body: {} },
    { method: 'delete', path: '/api/registro_diario/any-id/any-cliente', body: null },

    { method: 'post',   path: '/api/operaciones/abrir-caja',             body: {} },
    { method: 'post',   path: '/api/operaciones/registrar-salida-caja',  body: {} },
    { method: 'post',   path: '/api/operaciones/check-caja',             body: {} },
    { method: 'put',    path: '/api/operaciones/cierre-caja',            body: {} },
    { method: 'put',    path: '/api/operaciones/terminar-pedido/1',      body: {} },
    { method: 'get',    path: '/api/operaciones/detalle-pedido/1',       body: null },

    { method: 'post',   path: '/api/handoff/sign',              body: {} },

    { method: 'get',    path: '/api/users/type/1',              body: null },
    { method: 'get',    path: '/api/users/tipo',                body: null },
    { method: 'get',    path: '/api/users/rol/1/any-cliente',   body: null },
  ];

  protectedRoutes.forEach(({ method, path, body }) => {
    it(`${method.toUpperCase()} ${path} → 401 sin token`, async () => {
      const req = request(app)[method](path);
      if (body) req.send(body);
      const res = await req;
      expect(res.status).to.equal(401);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Sección 2: Autenticación — 403 con token inválido
// ═══════════════════════════════════════════════════════════════════════════

describe('Fase 1 — Auth: 401 con token inválido o expirado', () => {
  before(async () => {
    if (!chai) {
      chai = await import('chai');
      expect = chai.expect;
    }
  });

  it('PUT /api/cliente/me → 401 con token malformado', async () => {
    const res = await request(app)
      .put('/api/cliente/me')
      .set('Authorization', 'Bearer token.invalido.xyz')
      .send({});
    expect(res.status).to.equal(401);
  });

  it('POST /api/rol → 401 con token firmado con secret incorrecto', async () => {
    const badToken = jwt.sign({ userId: 'x', role: ['admin'] }, 'wrong-secret', { expiresIn: '1h' });
    const res = await request(app)
      .post('/api/rol')
      .set('Authorization', `Bearer ${badToken}`)
      .send({ descripcion: 'test' });
    expect(res.status).to.equal(401);
  });

  it('POST /api/operaciones/abrir-caja → 401 con token expirado', async () => {
    const expiredToken = jwt.sign(
      { userId: 'x', role: ['admin'], cliente_id: 1 },
      process.env.JWT_SECRET,
      { expiresIn: '-1s' }
    );
    const res = await request(app)
      .post('/api/operaciones/abrir-caja')
      .set('Authorization', `Bearer ${expiredToken}`)
      .send({});
    expect(res.status).to.equal(401);
  });

  it('GET /api/users/tipo → 401 sin header Authorization', async () => {
    const res = await request(app).get('/api/users/tipo');
    expect(res.status).to.equal(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Sección 3: Autenticación — token válido pasa la capa de auth
// ═══════════════════════════════════════════════════════════════════════════

describe('Fase 1 — Auth: token válido supera authenticateJWT (stub de servicios)', () => {
  before(async () => {
    if (!chai) {
      chai = await import('chai');
      expect = chai.expect;
    }
  });

  let adminToken;

  before(() => {
    adminToken = makeAdminToken();
  });

  beforeEach(() => {
    // Stub servicios para evitar DB
    sinon.stub(rolService, 'createRolService').resolves({ id: 'new-rol-id' });
    sinon.stub(rolService, 'getRolListService').resolves([{ id: '1', descripcion: 'Admin' }]);
    sinon.stub(planService, 'getClienteTierAndFeatures').resolves({
      features: { maxPedidosMensuales: null, maxProductos: null },
      tierCode: 'PREMIUM',
    });
    sinon.stub(operacionesService, 'registrarAperturaCierreCaja').resolves({ id: 'caja-id' });
    sinon.stub(operacionesService, 'checkCajaAbierta').resolves({ abierta: false });
  });

  afterEach(() => sinon.restore());

  it('POST /api/rol con token válido → no retorna 403 (llega al servicio)', async () => {
    const res = await request(app)
      .post('/api/rol')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ descripcion: 'Empleado' });
    // El service stub devuelve { id: 'new-rol-id' }
    expect(res.status).to.not.equal(403);
  });

  it('GET /api/rol/list/1 con token válido → 200', async () => {
    const res = await request(app)
      .get('/api/rol/list/1')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).to.equal(200);
    expect(res.body).to.be.an('array');
  });

  it('POST /api/operaciones/abrir-caja con token válido → no retorna 403', async () => {
    const res = await request(app)
      .post('/api/operaciones/abrir-caja')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ fecha: '2026-05-10', usuario_apertura_id: 1, caja_inicial: 100, sucursal_id: 1 });
    expect(res.status).to.not.equal(403);
  });

  it('GET /api/users/tipo con token válido → no retorna 403', async () => {
    // getUserTypeList puede fallar por DB pero NO por auth
    const res = await request(app)
      .get('/api/users/tipo')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).to.not.equal(403);
  });

  it('GET /api/users/rol/1/1 con token válido → no retorna 403', async () => {
    const res = await request(app)
      .get('/api/users/rol/1/1')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).to.not.equal(403);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Sección 4: authorizeRole — rol insuficiente bloqueado
// ═══════════════════════════════════════════════════════════════════════════

describe('Fase 1 — Auth: authorizeRole bloquea roles insuficientes', () => {
  before(async () => {
    if (!chai) {
      chai = await import('chai');
      expect = chai.expect;
    }
  });

  let employeeToken;

  before(() => {
    employeeToken = makeAdminToken({ role: ['empleado'] });
  });

  beforeEach(() => {
    sinon.stub(rolService, 'createRolService').resolves({ id: 'rol-id' });
    sinon.stub(clienteService, 'updateClienteService').resolves({ id: 1 });
  });

  afterEach(() => sinon.restore());

  it('POST /api/rol con role=empleado → 403 (requiere admin)', async () => {
    const res = await request(app)
      .post('/api/rol')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ descripcion: 'test' });
    expect(res.status).to.equal(403);
    expect(res.body).to.have.property('error', 'Insufficient permissions');
  });

  it('PUT /api/cliente/me con role=empleado → 403 (requiere admin)', async () => {
    const res = await request(app)
      .put('/api/cliente/me')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ nombre: 'test' });
    expect(res.status).to.equal(403);
    expect(res.body).to.have.property('error', 'Insufficient permissions');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Sección 5: Rate Limiting — endpoint de login
// ═══════════════════════════════════════════════════════════════════════════

describe('Fase 1 — Rate Limiting: login endpoint', () => {
  before(async () => {
    if (!chai) {
      chai = await import('chai');
      expect = chai.expect;
    }
    // Habilitar trust proxy para que X-Forwarded-For funcione
    app.set('trust proxy', 1);
  });

  after(() => {
    app.set('trust proxy', false);
  });

  const RATE_LIMIT_IP = '11.22.33.44'; // IP única para este test, aislada del resto
  const LOGIN_PATH = '/api/auth/login';
  const MAX_ATTEMPTS = 10;

  beforeEach(() => {
    // Stub pool.query so login responds instantly (no real DB in sandbox)
    sinon.stub(pool, 'query').resolves({ rows: [] });
  });

  afterEach(() => sinon.restore());

  it('respuesta incluye header X-RateLimit-Limit con valor 10', async () => {
    const res = await request(app)
      .post(LOGIN_PATH)
      .set('X-Forwarded-For', RATE_LIMIT_IP)
      .send({ email: 'test@test.com', password: 'wrong' });

    expect(res.headers).to.have.property('ratelimit-limit');
    expect(res.headers['ratelimit-limit']).to.equal('10');
  });

  it(`después de ${MAX_ATTEMPTS} intentos fallidos responde 429`, async () => {
    const ip = '11.22.33.45'; // IP distinta para no acumular con el test anterior

    // Enviar MAX_ATTEMPTS requests para agotar el límite
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      await request(app)
        .post(LOGIN_PATH)
        .set('X-Forwarded-For', ip)
        .send({ email: `spam${i}@test.com`, password: 'wrong' });
    }

    // El siguiente debe ser rechazado por rate limiting
    const blockedRes = await request(app)
      .post(LOGIN_PATH)
      .set('X-Forwarded-For', ip)
      .send({ email: 'blocked@test.com', password: 'wrong' });

    expect(blockedRes.status).to.equal(429);
    expect(blockedRes.body).to.have.property('error').that.includes('Demasiados intentos');
  });

  it('respuesta 429 incluye mensaje en español', async () => {
    const ip = '11.22.33.46';

    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      await request(app)
        .post(LOGIN_PATH)
        .set('X-Forwarded-For', ip)
        .send({ email: `x${i}@x.com`, password: 'x' });
    }

    const res = await request(app)
      .post(LOGIN_PATH)
      .set('X-Forwarded-For', ip)
      .send({ email: 'final@x.com', password: 'x' });

    expect(res.status).to.equal(429);
    expect(res.body.error).to.match(/15 minutos/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Sección 6: Webhook MercadoPago — firma HMAC obligatoria
// ═══════════════════════════════════════════════════════════════════════════

describe('Fase 1 — Webhook MercadoPago: firma HMAC obligatoria', () => {
  before(async () => {
    if (!chai) {
      chai = await import('chai');
      expect = chai.expect;
    }
  });

  const WEBHOOK_PATH = '/api/billing/webhook';
  const WEBHOOK_SECRET = 'test-webhook-secret-fase1'; // mismo que se seteó arriba

  it('sin headers x-signature y x-request-id → 401', async () => {
    const res = await request(app)
      .post(WEBHOOK_PATH)
      .send({ type: 'payment', data: { id: '123' } });
    expect(res.status).to.equal(401);
    expect(res.body).to.have.property('error').that.includes('signature');
  });

  it('con x-signature malformado (sin ts= ni v1=) → 401', async () => {
    const res = await request(app)
      .post(WEBHOOK_PATH)
      .set('x-signature', 'invalido')
      .set('x-request-id', 'req-abc')
      .send({ type: 'payment', data: { id: '123' } });
    expect(res.status).to.equal(401);
  });

  it('con signature de otro secret → 401 Invalid webhook signature', async () => {
    const ts = Date.now().toString();
    const badSignature = makeMpSignature('123', 'req-xyz', ts, 'otro-secret');

    const res = await request(app)
      .post(WEBHOOK_PATH)
      .query({ 'data.id': '123' })
      .set('x-signature', badSignature)
      .set('x-request-id', 'req-xyz')
      .send({ type: 'payment', data: { id: '123' } });

    expect(res.status).to.equal(401);
    expect(res.body).to.have.property('error', 'Invalid webhook signature');
  });

  it('con signature correcta supera la validación (no retorna 401)', async () => {
    const dataId   = '999';
    const reqId    = 'req-correct';
    const ts       = Date.now().toString();
    const goodSig  = makeMpSignature(dataId, reqId, ts, WEBHOOK_SECRET);

    const res = await request(app)
      .post(WEBHOOK_PATH)
      .query({ 'data.id': dataId })
      .set('x-signature', goodSig)
      .set('x-request-id', reqId)
      .send({ type: 'unknown', data: {} }); // type desconocido → IGNORED

    // 200 'IGNORED' significa que pasó la validación de firma
    expect(res.status).to.not.equal(401);
  });

  it('sin MP_WEBHOOK_SECRET configurado → 500', async () => {
    const originalSecret = process.env.MP_WEBHOOK_SECRET;
    delete process.env.MP_WEBHOOK_SECRET;

    try {
      const res = await request(app)
        .post(WEBHOOK_PATH)
        .send({ type: 'payment', data: { id: '123' } });
      expect(res.status).to.equal(500);
    } finally {
      // Restaurar siempre para no romper otros tests
      process.env.MP_WEBHOOK_SECRET = originalSecret;
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Sección 7: Handoff — /sign requiere autenticación
// ═══════════════════════════════════════════════════════════════════════════

describe('Fase 1 — Handoff: POST /sign requiere autenticación', () => {
  before(async () => {
    if (!chai) {
      chai = await import('chai');
      expect = chai.expect;
    }
  });

  it('POST /api/handoff/sign sin token → 401', async () => {
    const res = await request(app)
      .post('/api/handoff/sign')
      .send({ conversationId: 'conv-1', waPhoneId: 'wa-1' });
    expect(res.status).to.equal(401);
  });

  it('POST /api/handoff/sign con token inválido → 401', async () => {
    const res = await request(app)
      .post('/api/handoff/sign')
      .set('Authorization', 'Bearer este.no.es.valido')
      .send({ conversationId: 'conv-1', waPhoneId: 'wa-1' });
    expect(res.status).to.equal(401);
  });

  it('POST /api/handoff/sign con token válido y body correcto → emite token (200)', async () => {
    const token = makeAdminToken();
    const res = await request(app)
      .post('/api/handoff/sign')
      .set('Authorization', `Bearer ${token}`)
      .send({ conversationId: 'conv-123', waPhoneId: '+5491112345678' });
    expect(res.status).to.equal(200);
    expect(res.body).to.have.property('token').that.is.a('string');
    expect(res.body).to.have.property('expiresIn').that.is.a('number');
  });

  it('POST /api/handoff/sign con token válido pero body vacío → 400', async () => {
    const token = makeAdminToken();
    const res = await request(app)
      .post('/api/handoff/sign')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).to.equal(400);
    expect(res.body).to.have.property('message').that.includes('required');
  });

  it('GET /api/handoff/resolve sigue siendo público (usa handoff JWT propio)', async () => {
    // resolve usa handoffAuth (no authenticateJWT), por eso es público a JWT del sistema
    const res = await request(app)
      .get('/api/handoff/resolve')
      .query({ c: 'token-invalido' });
    // 401 de handoffAuth (token inválido) — no 403 de authenticateJWT
    expect(res.status).to.equal(401);
    expect(res.body).to.have.property('message');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Sección 8: requireLimit — /crear-pedido-whatsaap tiene límite
// ═══════════════════════════════════════════════════════════════════════════

describe('Fase 1 — requireLimit: /crear-pedido-whatsaap tiene límite mensual', () => {
  before(async () => {
    if (!chai) {
      chai = await import('chai');
      expect = chai.expect;
    }
  });

  let adminToken;

  before(() => {
    adminToken = makeAdminToken();
  });

  afterEach(() => sinon.restore());

  it('sin token → 401 (auth antes que el límite)', async () => {
    const res = await request(app)
      .post('/api/operaciones/crear-pedido-whatsaap')
      .send({});
    expect(res.status).to.equal(401);
  });

  it('con token válido pero límite alcanzado → 403 de plan', async () => {
    sinon.stub(planService, 'getClienteTierAndFeatures').resolves({
      features: { maxPedidosMensuales: 0 }, // límite 0 → ya alcanzado
      tierCode: 'FREE',
    });
    // pool.query necesita stub para el COUNT
    const pool = require('../pool');
    sinon.stub(pool, 'query').resolves({ rows: [{ count: '0' }] });

    const res = await request(app)
      .post('/api/operaciones/crear-pedido-whatsaap')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});

    expect(res.status).to.equal(403);
    expect(res.body.error).to.include('FREE');
  });
});
