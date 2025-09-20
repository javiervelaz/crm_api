const request = require('supertest');
const sinon = require('sinon');
const app = require('../node'); // Asegúrate de que la ruta sea correcta a tu archivo principal
const ModuloRolService = require('../services/modulo_rol/moduloRolService'); // Importa el servicio de usuarios

let chai;
let expect;

describe('modulo rol API', () => {
  before(async () => {
    chai = await import('chai');
    expect = chai.expect;
  });

  let mockmoduloRolId = 'mocked-modulo-rol-id';

  beforeEach(() => {
    // Mock de las funciones del servicio de usuarios
    sinon.stub(ModuloRolService, 'createModuloRolService').callsFake(async (modulo) => {
        const { id_rol,id_modulo } = modulo;
        if (!id_rol || !id_modulo) {
          throw new Error('All fields are required');
        }
        return { id: mockmoduloRolId };
      });
    sinon.stub(ModuloRolService, 'getModuloRolByIdService').returns(Promise.resolve({ id: mockmoduloRolId, id_rol:1 , id_modulo : 1}));
    sinon.stub(ModuloRolService, 'getModuloRolListService').returns(Promise.resolve([{ id: mockmoduloRolId, id_rol: 1, id_modulo : 1 }]));
    sinon.stub(ModuloRolService, 'updateModuloRolService').callsFake(async (mockmoduloRolId,modulo) => {
        const  { id_rol,id_modulo }  = modulo;
        if (!id_rol || !id_modulo) {
          throw new Error('All fields are required');
        }
        
        return {id:mockmoduloRolId, id_rol: 2,id_modulo:2 };
      })
    sinon.stub(ModuloRolService, 'deleteModuloRolService').returns(Promise.resolve({}));
  });

  afterEach(() => {
    // Restaurar las funciones originales
    sinon.restore();
  });

  it('should create a new modulo', async () => {
    const res = await request(app)
      .post('/api/modulorol')
      .send({
        id_rol: 1,
        id_modulo: 1
      });
      
    expect(res.status).to.equal(201);
    expect(res.body).to.have.property('id', mockmoduloRolId);
  });

  it('should return error if required fields are missing when creating modulo', async () => {
    const res = await request(app)
      .post('/api/modulorol')
      .send({
        id_rol: null,
        id_modulo: 2
      });
    expect(res.status).to.equal(400);
    expect(res.body).to.have.property('error', 'All fields are required');
  });

  it('should get a single modulo', async () => {
    const res = await request(app).get(`/api/modulorol/${mockmoduloRolId}`);
    expect(res.status).to.equal(200);
    expect(res.body).to.have.property('id', mockmoduloRolId);
  });

  it('should get a list of modulos', async () => {
    const res = await request(app).get('/api/modulorol/list');
    expect(res.status).to.equal(200);
    expect(res.body).to.be.an('array');
  });

  it('should update a modulo', async () => {
    const res = await request(app)
      .put(`/api/modulorol/${mockmoduloRolId}`)
      .send({
        id_rol: 2,
        id_modulo: 2
      });
    expect(res.status).to.equal(200);
    expect(res.body).to.have.property('id_rol', 2);
  });
  
  it('should delete a modulo', async () => {
    const res = await request(app).delete(`/api/modulorol/${mockmoduloRolId}`);
    expect(res.status).to.equal(200);
  });

});