const request = require('supertest');
const sinon = require('sinon');
const jwt = require('jsonwebtoken');
const app = require('../node');
const clienteService = require('../services/cliente/clienteService');

let chai;
let expect;

describe('Cliente API', () => {
  let adminToken;

  before(async () => {
    chai = await import('chai');
    expect = chai.expect;
    adminToken = jwt.sign(
      {
        userId: 'test-user-id',
        cliente_id: 'test-cliente-id',
        username: 'test',
        sucursal: 1,
        role: ['admin'],
        modules: [],
        permissions: {},
      },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
  });

  const mockClienteId = 'mocked-cliente-id';

  beforeEach(() => {
    sinon.stub(clienteService, 'createClienteService').callsFake(async (data) => {
      const { nombre, cuit, adminNombre, adminApellido, adminEmail } = data;
      if (!nombre || !cuit) {
        throw new Error('nombre y cuit son obligatorios');
      }
      if (!adminNombre || !adminApellido || !adminEmail) {
        throw new Error('datos del usuario administrador incompletos');
      }
      return {
        cliente: { id: mockClienteId, nombre },
        adminUser: { id: 'admin-id', nombre: adminNombre, apellido: adminApellido, email: adminEmail },
        roles: [],
        modulos: [],
      };
    });

    sinon.stub(clienteService, 'getClienteByIdService').callsFake(async (id) => {
      return { id, nombre: 'Test Cliente', cuit: '20-12345678-9' };
    });

    sinon.stub(clienteService, 'getClienteListService').callsFake(async () => {
      return [{ id: mockClienteId, nombre: 'Test Cliente', cuit: '20-12345678-9' }];
    });

    sinon.stub(clienteService, 'updateClienteService').callsFake(async (id, data) => {
      return { id, ...data };
    });

    sinon.stub(clienteService, 'deleteClienteService').callsFake(async (id) => {
      return { message: 'Cliente eliminado' };
    });
  });

  afterEach(() => {
    sinon.restore();
  });

  it('should create a new cliente', async () => {
    const res = await request(app)
      .post('/api/cliente')
      .set('Authorization', 'Bearer ' + adminToken)
      .send({
        nombre: 'Mi Empresa',
        cuit: '20-12345678-9',
        adminNombre: 'Juan',
        adminApellido: 'Perez',
        adminEmail: 'admin@empresa.com',
        adminDni: '12345678',
        plan: 'FREE',
        telefono: '1122334455',
        adminPassword: 'password123',
      });
    expect(res.status).to.equal(201);
    expect(res.body).to.have.property('cliente');
    expect(res.body.cliente).to.have.property('id', mockClienteId);
  });

  it('should return error if nombre or cuit is missing when creating cliente', async () => {
    const res = await request(app)
      .post('/api/cliente')
      .set('Authorization', 'Bearer ' + adminToken)
      .send({
        nombre: '',
        cuit: '',
        adminNombre: 'Juan',
        adminApellido: 'Perez',
        adminEmail: 'admin@empresa.com',
      });
    expect(res.status).to.equal(400);
    expect(res.body).to.have.property('error', 'nombre y cuit son obligatorios');
  });

  it('should return error if admin data is incomplete when creating cliente', async () => {
    const res = await request(app)
      .post('/api/cliente')
      .set('Authorization', 'Bearer ' + adminToken)
      .send({
        nombre: 'Mi Empresa',
        cuit: '20-12345678-9',
        adminNombre: '',
        adminApellido: '',
        adminEmail: '',
      });
    expect(res.status).to.equal(400);
    expect(res.body).to.have.property('error', 'datos del usuario administrador incompletos');
  });

  it('should get a list of clientes', async () => {
    const res = await request(app)
      .get('/api/cliente/list/')
      .set('Authorization', 'Bearer ' + adminToken);
    expect(res.status).to.equal(200);
    expect(res.body).to.be.an('array');
  });

  it('should get a cliente by id', async () => {
    const res = await request(app)
      .get('/api/cliente/list/' + mockClienteId)
      .set('Authorization', 'Bearer ' + adminToken);
    expect(res.status).to.equal(200);
    expect(res.body).to.have.property('id');
  });

  it('should update a cliente', async () => {
    const res = await request(app)
      .put('/api/cliente/' + mockClienteId)
      .set('Authorization', 'Bearer ' + adminToken)
      .send({
        codigo: 'CLI001',
        descripcion: 'Cliente Actualizado',
        status: true,
        cliente_id: mockClienteId,
      });
    expect(res.status).to.equal(200);
    expect(res.body).to.have.property('descripcion', 'Cliente Actualizado');
  });

  it('should delete a cliente', async () => {
    const res = await request(app)
      .delete('/api/cliente/' + mockClienteId)
      .set('Authorization', 'Bearer ' + adminToken);
    expect(res.status).to.equal(200);
  });
});
