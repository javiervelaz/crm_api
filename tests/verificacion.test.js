// tests/verificacion.test.js
const request = require('supertest');
const sinon = require('sinon');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-tests';
const app = require('../node');
const userService = require('../services/user/userService');
const verificacion = require('../services/verificacion/verificacionService');
const { ESTADOS } = require('../services/verificacion/estados');

const sesion = (estado) => ({
  id: 10, username: 'javi@ejemplo.com', name: 'Javier, Velaz',
  role: ['ADMIN'], modules: [], permissions: {},
  cliente_id: 1, cliente_estado: estado,
});

describe('Gate de activación en el login', () => {
  let expect;
  before(async () => { ({ expect } = await import('chai')); });
  afterEach(() => sinon.restore());

  it('deja entrar a un cliente ACTIVO', async () => {
    sinon.stub(userService, 'authenticate').resolves(sesion(ESTADOS.ACTIVO));
    const res = await request(app).post('/api/auth/login').send({ email: 'javi@ejemplo.com', password: 'x' });
    expect(res.status).to.equal(200);
    expect(res.body.token).to.be.a('string');
  });

  it('rechaza con 403 EMAIL_NO_VERIFICADO si está PENDIENTE_VERIFICACION', async () => {
    sinon.stub(userService, 'authenticate').resolves(sesion(ESTADOS.PENDIENTE));
    const res = await request(app).post('/api/auth/login').send({ email: 'javi@ejemplo.com', password: 'x' });
    expect(res.status).to.equal(403);
    expect(res.body.code).to.equal('EMAIL_NO_VERIFICADO');
    expect(res.body.token).to.equal(undefined);
  });

  it('no filtra el email en el body del 403', async () => {
    // El front ya tiene el email en el input. Devolverlo desde el server
    // confirma qué direcciones están registradas.
    sinon.stub(userService, 'authenticate').resolves(sesion(ESTADOS.PENDIENTE));
    const res = await request(app).post('/api/auth/login').send({ email: 'javi@ejemplo.com', password: 'x' });
    expect(JSON.stringify(res.body)).to.not.contain('javi@ejemplo.com');
  });

  it('rechaza con 403 CUENTA_INHABILITADA si está BLOQUEADO o SUSPENDIDO', async () => {
    for (const estado of [ESTADOS.BLOQUEADO, ESTADOS.SUSPENDIDO]) {
      sinon.restore();
      sinon.stub(userService, 'authenticate').resolves(sesion(estado));
      const res = await request(app).post('/api/auth/login').send({ email: 'javi@ejemplo.com', password: 'x' });
      expect(res.status).to.equal(403, `estado: ${estado}`);
      expect(res.body.code).to.equal('CUENTA_INHABILITADA');
    }
  });

  it('devuelve 401 (no 403) con contraseña incorrecta sobre cuenta pendiente', async () => {
    // Clave: el gate corre DESPUÉS de validar la contraseña. Si corriera
    // antes, el login sería un oráculo de qué emails existen.
    sinon.stub(userService, 'authenticate').resolves({ error: 'Invalid credentials' });
    const res = await request(app).post('/api/auth/login').send({ email: 'javi@ejemplo.com', password: 'mal' });
    expect(res.status).to.equal(401);
  });

  it('no deja entrar con un estado desconocido', async () => {
    sinon.stub(userService, 'authenticate').resolves(sesion('LO_QUE_SEA'));
    const res = await request(app).post('/api/auth/login').send({ email: 'javi@ejemplo.com', password: 'x' });
    expect(res.status).to.equal(403);
  });
});

describe('GET /api/verify-email/:token', () => {
  let expect;
  before(async () => { ({ expect } = await import('chai')); });
  afterEach(() => sinon.restore());

  it('rechaza un token con formato inválido sin tocar la base', async () => {
    const res = await request(app).get('/api/verify-email/no-es-un-token');
    expect(res.status).to.equal(400);
    expect(res.body.code).to.equal('INVALID_TOKEN');
  });

  it('activa la cuenta y devuelve sesión', async () => {
    sinon.stub(verificacion, 'verificar').resolves({
      clienteId: 1, userId: 10, email: 'javi@ejemplo.com', yaEstabaActivo: false,
    });
    sinon.stub(userService, 'buildSessionById').resolves(sesion(ESTADOS.ACTIVO));

    const res = await request(app).get(`/api/verify-email/${'a'.repeat(64)}`);
    expect(res.status).to.equal(200);
    expect(res.body.ok).to.equal(true);
    expect(res.body.token).to.be.a('string');
  });

  it('responde 200 aunque no se pueda armar la sesión: la cuenta ya quedó activa', async () => {
    sinon.stub(verificacion, 'verificar').resolves({
      clienteId: 1, userId: 10, email: 'javi@ejemplo.com', yaEstabaActivo: false,
    });
    sinon.stub(userService, 'buildSessionById').rejects(new Error('DB caída'));

    const res = await request(app).get(`/api/verify-email/${'a'.repeat(64)}`);
    expect(res.status).to.equal(200);
    expect(res.body.token).to.equal(undefined);
  });

  it('devuelve 400 TOKEN_EXPIRED si el link venció o ya se usó', async () => {
    sinon.stub(verificacion, 'verificar').rejects(
      new verificacion.VerificacionError('El enlace expiró o ya fue usado', { code: 'TOKEN_EXPIRED' })
    );
    const res = await request(app).get(`/api/verify-email/${'b'.repeat(64)}`);
    expect(res.status).to.equal(400);
    expect(res.body.code).to.equal('TOKEN_EXPIRED');
  });
});

describe('POST /api/verify-email/resend', () => {
  let expect;
  before(async () => { ({ expect } = await import('chai')); });
  afterEach(() => sinon.restore());

  it('responde 200 { ok: true } cuando el email existe', async () => {
    sinon.stub(verificacion, 'reenviar').resolves({ enviado: true, clienteId: 1 });
    const res = await request(app).post('/api/verify-email/resend').send({ email: 'javi@ejemplo.com' });
    expect(res.status).to.equal(200);
    expect(res.body).to.deep.equal({ ok: true });
  });

  it('responde exactamente lo mismo cuando el email NO existe', async () => {
    // Un 404 acá convierte el endpoint en un enumerador de clientes.
    sinon.stub(verificacion, 'reenviar').resolves({ enviado: false });
    const res = await request(app).post('/api/verify-email/resend').send({ email: 'nadie@ejemplo.com' });
    expect(res.status).to.equal(200);
    expect(res.body).to.deep.equal({ ok: true });
  });

  it('responde 200 aun si el reenvío explota por dentro', async () => {
    sinon.stub(verificacion, 'reenviar').rejects(new Error('DB caída'));
    const res = await request(app).post('/api/verify-email/resend').send({ email: 'javi@ejemplo.com' });
    expect(res.status).to.equal(200);
    expect(res.body).to.deep.equal({ ok: true });
  });
});
