// tests/signup.test.js
const request = require('supertest');
const sinon = require('sinon');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-tests';
const app = require('../node');
const ClienteService = require('../services/cliente/clienteService');
const userService = require('../services/user/userService');
const mpService = require('../services/billing/mercadoPagoService');
const emailService = require('../services/email/emailService');

const VALIDO = {
  comercioNombre: 'Kiosco Don Pepe',
  cuit: '30712345670',            // reemplazar por un CUIT con DV válido
  adminNombre: 'Javier',
  adminApellido: 'Velaz',
  adminEmail: 'javi@ejemplo.com',
  adminDni: '30123456',
  telefono: '3513344326',
  password: 'Contrasena123',
  aceptaTerminos: 'true',
  plan: 'FREE',
};

describe('POST /api/signup', () => {
  let expect;
  before(async () => { ({ expect } = await import('chai')); });
  afterEach(() => sinon.restore());

  const stubProvisioning = (over = {}) =>
    sinon.stub(ClienteService, 'createClienteService').resolves({
      cliente: { id: 1, nombre: VALIDO.comercioNombre, cuit: VALIDO.cuit },
      tier: { id: 1, code: 'FREE', nombre_publico: 'Free', precio_mensual: 0, duracion_meses: 0 },
      esPago: false,
      verificationToken: 'a'.repeat(64),
      adminUser: { id: 10, nombre: 'Javier', apellido: 'Velaz', email: VALIDO.adminEmail, cliente_id: 1 },
      roles: [], modulos: [],
      ...over,
    });

  it('crea la cuenta y devuelve token de sesión', async () => {
    stubProvisioning();
    sinon.stub(userService, 'authenticate').resolves({
      id: 10, name: 'Javier, Velaz', cliente_id: 1,
      role: ['ADMIN'], modules: ['productos'], permissions: {},
    });
    sinon.stub(emailService, 'sendWelcomeEmail').resolves();

    const res = await request(app).post('/api/signup').send(VALIDO);

    expect(res.status).to.equal(201);
    expect(res.body.token).to.be.a('string');
    expect(res.body.cliente.id).to.equal(1);
  });

  it('devuelve 201 aunque falle el envío del email', async () => {
    stubProvisioning();
    sinon.stub(userService, 'authenticate').resolves({ id: 10, name: 'J', cliente_id: 1 });
    sinon.stub(emailService, 'sendWelcomeEmail').rejects(new Error('SMTP caído'));

    const res = await request(app).post('/api/signup').send(VALIDO);
    expect(res.status).to.equal(201);   // la cuenta existe: no puede fallar el request
  });

  it('devuelve 201 con warning si MercadoPago falla', async () => {
    stubProvisioning({
      esPago: true,
      tier: { id: 2, code: 'PREMIUM', nombre_publico: 'Premium', precio_mensual: 15000, duracion_meses: 1 },
    });
    sinon.stub(userService, 'authenticate').resolves({ id: 10, name: 'J', cliente_id: 1 });
    sinon.stub(mpService, 'createOneTimePayment').rejects(new Error('MP 503'));
    sinon.stub(emailService, 'sendWelcomeEmail').resolves();

    const res = await request(app).post('/api/signup').send({ ...VALIDO, plan: 'PREMIUM' });

    expect(res.status).to.equal(201);
    expect(res.body.paymentWarning).to.be.a('string');
    expect(res.body.token).to.be.a('string');
  });

  it('rechaza CUIT con dígito verificador inválido', async () => {
    const res = await request(app).post('/api/signup').send({ ...VALIDO, cuit: '11111111111' });
    expect(res.status).to.equal(400);
    expect(res.body.field).to.equal('cuit');
  });

  it('rechaza password débil', async () => {
    for (const password of ['corta', 'sinmayusculas123', 'SINMINUSCULAS123', 'SinNumeros']) {
      const res = await request(app).post('/api/signup').send({ ...VALIDO, password });
      expect(res.status).to.equal(400, `password: ${password}`);
      expect(res.body.field).to.equal('password');
    }
  });

  it('exige aceptación de términos', async () => {
    const { aceptaTerminos, ...sinTerminos } = VALIDO;
    const res = await request(app).post('/api/signup').send(sinTerminos);
    expect(res.status).to.equal(400);
  });

  it('devuelve 400 con código si el CUIT ya existe', async () => {
    const err = new ClienteService.SignupError('Ya existe una cuenta con ese CUIT', {
      code: 'CUIT_TAKEN', field: 'cuit',
    });
    sinon.stub(ClienteService, 'createClienteService').rejects(err);

    const res = await request(app).post('/api/signup').send(VALIDO);
    expect(res.status).to.equal(400);
    expect(res.body.code).to.equal('CUIT_TAKEN');
  });

  it('no requiere autenticación', async () => {
    stubProvisioning();
    sinon.stub(userService, 'authenticate').resolves({ id: 10, name: 'J', cliente_id: 1 });
    sinon.stub(emailService, 'sendWelcomeEmail').resolves();

    const res = await request(app).post('/api/signup').send(VALIDO);
    expect(res.status).to.not.be.oneOf([401, 403]);
  });
});