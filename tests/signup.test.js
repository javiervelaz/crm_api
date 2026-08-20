// tests/signup.test.js
const request = require('supertest');
const sinon = require('sinon');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-tests';
const app = require('../node');
const ClienteService = require('../services/cliente/clienteService');
const mpService = require('../services/billing/mercadoPagoService');
const mailer = require('../services/email');

const VALIDO = {
  comercioNombre: 'Kiosco Don Pepe',
  cuit: '30712345671',            // DV verificado con el algoritmo de validators/signupValidator.js
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

  it('crea la cuenta y NO devuelve token: primero hay que verificar el email', async () => {
    stubProvisioning();
    sinon.stub(mailer, 'drain').resolves({ sent: 1, failed: 0, retry: 0, procesados: 1 });

    const res = await request(app).post('/api/signup').send(VALIDO);

    expect(res.status).to.equal(201);
    expect(res.body.token).to.equal(undefined);
    expect(res.body.requiereVerificacion).to.equal(true);
    expect(res.body.emailVerificacion).to.equal(VALIDO.adminEmail);
    expect(res.body.cliente.id).to.equal(1);
  });

  it('devuelve 201 aunque falle el drenado de la cola de emails', async () => {
    stubProvisioning();
    // El mail ya quedó encolado dentro de la transacción del provisioning:
    // que el envío inmediato falle no puede romper el request, lo levanta
    // el drenado periódico.
    sinon.stub(mailer, 'drain').rejects(new Error('Resend caído'));

    const res = await request(app).post('/api/signup').send(VALIDO);
    expect(res.status).to.equal(201);
  });

  it('devuelve 201 con warning si MercadoPago falla', async () => {
    stubProvisioning({
      esPago: true,
      tier: { id: 2, code: 'PREMIUM', nombre_publico: 'Premium', precio_mensual: 15000, duracion_meses: 1 },
    });
    sinon.stub(mpService, 'createOneTimePayment').rejects(new Error('MP 503'));
    sinon.stub(mailer, 'drain').resolves({ sent: 1, failed: 0, retry: 0, procesados: 1 });

    const res = await request(app).post('/api/signup').send({ ...VALIDO, plan: 'PREMIUM' });

    expect(res.status).to.equal(201);
    expect(res.body.paymentWarning).to.be.a('string');
    expect(res.body.token).to.equal(undefined);
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
    sinon.stub(mailer, 'drain').resolves({ sent: 0, failed: 0, retry: 0, procesados: 0 });

    const res = await request(app).post('/api/signup').send(VALIDO);
    expect(res.status).to.not.be.oneOf([401, 403]);
  });
});