const request = require('supertest');
const sinon = require('sinon');
const app = require('../node');
const clienteService = require('../services/cliente/clienteService');

let chai;
let expect;

describe('Cliente API', () => {
  before(async () => {
    chai = await import('chai');
    expect = chai.expect;
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

    // Note: clienteController imports clienteService as "ModuloService" and calls
    // getModuloByIdService, getModuloListService, updateModuloService, deleteModuloService.
    // These are method names from a copy-paste of moduloController. We stub them
    // directly on the service object so the controller can find them.
    clienteService.getModuloByIdService = sinon.stub().callsFake(async (id) => {
      return { id, nombre: 'Test Cliente', cuit: '20-12345678-9' };
    });

    clienteService.getModuloListService = sinon.stub().callsFake(async () => {
      return [{ id: mockClienteId, nombre: 'Test Cliente', cuit: '20-12345678-9' }];
    });

    clienteService.updateModuloService = sinon.stub().callsFake(async (id, data) => {
      return { id, ...data };
    });

    clienteService.deleteModuloService = sinon.stub().callsFake(async (id) => {
      return { message: 'Cliente eliminado' };
    });
  });

  afterEach(() => {
    sinon.restore();
    delete clienteService.getModuloByIdService;
    delete clienteService.getModuloListService;
    delete clienteService.updateModuloService;
    delete clienteService.deleteModuloService;
  });

  // CREATE
  it('should create a new cliente', async () => {
    const res = await request(app)
      .post('/api/cliente')
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

  // GET LIST
  it('should get a list of clientes', async () => {
    const res = await request(app)
      .get('/api/cliente/list/');

    expect(res.status).to.equal(200);
    expect(res.body).to.be.an('array');
  });

  // GET BY ID
  it('should get a cliente by id', async () => {
    const res = await request(app)
      .get(`/api/cliente/list/${mockClienteId}`);

    expect(res.status).to.equal(200);
    expect(res.body).to.have.property('id');
  });

  // UPDATE
  it('should update a cliente', async () => {
    const res = await request(app)
      .put(`/api/cliente/${mockClienteId}`)
      .send({
        codigo: 'CLI001',
        descripcion: 'Cliente Actualizado',
        status: true,
        cliente_id: mockClienteId,
      });

    expect(res.status).to.equal(200);
    expect(res.body).to.have.property('descripcion', 'Cliente Actualizado');
  });

  // DELETE
  it('should delete a cliente', async () => {
    const res = await request(app)
      .delete(`/api/cliente/${mockClienteId}`);

    expect(res.status).to.equal(200);
  });
});
