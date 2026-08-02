const request = require('supertest');
const sinon = require('sinon');
const jwt = require('jsonwebtoken');
const app = require('../node');
const clienteService = require('../services/cliente/clienteService');

let chai;
let expect;

describe('Cliente API (/api/cliente/me)', () => {
  const CLIENTE_ID = 1;
  let adminToken;
  let employeeToken;

  before(async () => {
    chai = await import('chai');
    expect = chai.expect;

    const basePayload = {
      userId: 'test-user-id',
      cliente_id: CLIENTE_ID,
      username: 'test',
      sucursal: 1,
      modules: [],
      permissions: {},
    };
    adminToken = jwt.sign({ ...basePayload, role: ['admin'] }, process.env.JWT_SECRET, { expiresIn: '1h' });
    employeeToken = jwt.sign({ ...basePayload, role: ['empleado'] }, process.env.JWT_SECRET, { expiresIn: '1h' });
  });

  beforeEach(() => {
    sinon.stub(clienteService, 'getClienteByIdService').callsFake(async (id) => {
      return { id: Number(id), nombre: 'Mi Empresa', cuit: '20-12345678-9' };
    });

    sinon.stub(clienteService, 'updateClienteService').callsFake(async (id, data) => {
      return { id: Number(id), nombre: 'Mi Empresa', cuit: '20-12345678-9', ...data };
    });
  });

  afterEach(() => {
    sinon.restore();
  });

  it('GET /api/cliente/me sin token → 401', async () => {
    const res = await request(app).get('/api/cliente/me');
    expect(res.status).to.equal(401);
  });

  it('GET /api/cliente/me devuelve la ficha del propio tenant', async () => {
    const res = await request(app)
      .get('/api/cliente/me')
      .set('Authorization', 'Bearer ' + adminToken);
    expect(res.status).to.equal(200);
    expect(res.body).to.have.property('id', CLIENTE_ID);
    expect(res.body).to.have.property('nombre', 'Mi Empresa');
  });

  it('PUT /api/cliente/me actualiza la ficha con rol admin', async () => {
    const res = await request(app)
      .put('/api/cliente/me')
      .set('Authorization', 'Bearer ' + adminToken)
      .send({ nombre: 'Empresa Actualizada' });
    expect(res.status).to.equal(200);
    expect(res.body).to.have.property('nombre', 'Empresa Actualizada');
  });

  it('PUT /api/cliente/me con role=empleado → 403 (requiere admin)', async () => {
    const res = await request(app)
      .put('/api/cliente/me')
      .set('Authorization', 'Bearer ' + employeeToken)
      .send({ nombre: 'Empresa Actualizada' });
    expect(res.status).to.equal(403);
  });
});
