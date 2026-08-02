const request = require('supertest');
const sinon = require('sinon');
const jwt = require('jsonwebtoken');
const app = require('../node');
const rolService = require('../services/rol/rolService');

let chai;
let expect;

describe('Rol API', () => {
  let adminToken;

  before(async () => {
    chai = await import('chai');
    expect = chai.expect;
    adminToken = jwt.sign(
      {
        userId: 'test-user-id',
        cliente_id: 1,
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

  const mockRolId = 'mocked-rol-id';
  const mockClienteId = 1;

  beforeEach(() => {
    sinon.stub(rolService, 'createRolService').callsFake(async (rol) => {
      const { descripcion } = rol;
      if (!descripcion) {
        throw new Error('All fields are required');
      }
      return { id: mockRolId };
    });
    sinon.stub(rolService, 'getRolByIdService').returns(Promise.resolve({ id: mockRolId, descripcion: 'Admin' }));
    sinon.stub(rolService, 'getRolListService').returns(Promise.resolve([{ id: mockRolId, descripcion: 'Admin' }]));
    sinon.stub(rolService, 'updateRolService').callsFake(async (id, rol) => {
      const descripcion = rol;
      if (!descripcion) {
        throw new Error('All fields are required');
      }
      return { id: mockRolId, descripcion: 'empleado' };
    });
    sinon.stub(rolService, 'deleteRolService').returns(Promise.resolve({}));
  });

  afterEach(() => {
    sinon.restore();
  });

  it('should create a new rol', async () => {
    const res = await request(app)
      .post('/api/rol')
      .set('Authorization', 'Bearer ' + adminToken)
      .send({ descripcion: 'Admin' });
    expect(res.status).to.equal(201);
    expect(res.body).to.have.property('id', mockRolId);
  });

  it('should return error if required fields are missing when creating rol', async () => {
    const res = await request(app)
      .post('/api/rol')
      .set('Authorization', 'Bearer ' + adminToken)
      .send({ descripcion: '' });
    expect(res.status).to.equal(400);
    expect(res.body).to.have.property('error', 'All fields are required');
  });

  it('should get a single rol', async () => {
    const res = await request(app)
      .get('/api/rol/' + mockRolId + '/' + mockClienteId)
      .set('Authorization', 'Bearer ' + adminToken);
    expect(res.status).to.equal(200);
    expect(res.body).to.have.property('id', mockRolId);
  });

  it('should get a list of rols', async () => {
    const res = await request(app)
      .get('/api/rol/list/' + mockClienteId)
      .set('Authorization', 'Bearer ' + adminToken);
    expect(res.status).to.equal(200);
    expect(res.body).to.be.an('array');
  });

  it('should update a rol', async () => {
    const res = await request(app)
      .put('/api/rol/' + mockRolId)
      .set('Authorization', 'Bearer ' + adminToken)
      .send({ descripcion: 'empleado' });
    expect(res.status).to.equal(200);
    expect(res.body).to.have.property('descripcion', 'empleado');
  });

  it('should delete a rol', async () => {
    const res = await request(app)
      .delete('/api/rol/' + mockRolId + '/' + mockClienteId)
      .set('Authorization', 'Bearer ' + adminToken);
    expect(res.status).to.equal(200);
  });
});
