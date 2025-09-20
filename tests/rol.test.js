const request = require('supertest');
const sinon = require('sinon');
const app = require('../node'); // Asegúrate de que la ruta sea correcta a tu archivo principal
const rolService = require('../services/rol/rolService'); // Importa el servicio de usuarios

let chai;
let expect;

describe('Rol API', () => {
  before(async () => {
    chai = await import('chai');
    expect = chai.expect;
  });

  let mockRolId = 'mocked-rol-id';

  beforeEach(() => {
    // Mock de las funciones del servicio de usuarios
    sinon.stub(rolService, 'createRolService').callsFake(async (rol) => {
        const { descripcion } = rol;
        if (!descripcion ) {
          throw new Error('All fields are required');
        }
        return { id: mockRolId };
      });
    sinon.stub(rolService, 'getRolByIdService').returns(Promise.resolve({ id: mockRolId, descripcion: 'Admin' }));
    sinon.stub(rolService, 'getRolListService').returns(Promise.resolve([{ id: mockRolId, descripcion: 'Admin' }]));
    sinon.stub(rolService, 'updateRolService').callsFake(async (mockRolId,rol) => {
        const  descripcion  = rol;
        if (!descripcion ) {
          throw new Error('All fields are required');
        }
        
        return {id:mockRolId, descripcion: "empleado" };
      })
    sinon.stub(rolService, 'deleteRolService').returns(Promise.resolve({}));
  });

  afterEach(() => {
    // Restaurar las funciones originales
    sinon.restore();
  });

  it('should create a new rol', async () => {
    const res = await request(app)
      .post('/api/rol')
      .send({
        descripcion: 'Admin'
      });
    expect(res.status).to.equal(201);
    expect(res.body).to.have.property('id', mockRolId);
  });

  it('should return error if required fields are missing when creating rol', async () => {
    const res = await request(app)
      .post('/api/rol')
      .send({
        descripcion: ''
      });
    expect(res.status).to.equal(400);
    expect(res.body).to.have.property('error', 'All fields are required');
  });

  it('should get a single rol', async () => {
    const res = await request(app).get(`/api/rol/${mockRolId}`);
    expect(res.status).to.equal(200);
    expect(res.body).to.have.property('id', mockRolId);
  });

  it('should get a list of rols', async () => {
    const res = await request(app).get('/api/rol/list');
    expect(res.status).to.equal(200);
    expect(res.body).to.be.an('array');
  });

  it('should update a rol', async () => {
    const res = await request(app)
      .put(`/api/rol/${mockRolId}`)
      .send({
        descripcion: 'empleado'
      });
    expect(res.status).to.equal(200);
    expect(res.body).to.have.property('descripcion', 'empleado');
  });
  
  it('should delete a rol', async () => {
    const res = await request(app).delete(`/api/rol/${mockRolId}`);
    expect(res.status).to.equal(200);
  });

});