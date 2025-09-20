const request = require('supertest');
const sinon = require('sinon');
const app = require('../node'); // Asegúrate de que la ruta sea correcta a tu archivo principal
const ModuloUserRolService = require('../services/user_rol/userRolService'); // Importa el servicio de usuarios

let chai;
let expect;

describe('User Rol API', () => {
  before(async () => {
    chai = await import('chai');
    expect = chai.expect;
  });

  let mockUserRolId = 'mocked-user-rol-id';

  beforeEach(() => {
    // Mock de las funciones del servicio de usuarios
    sinon.stub(ModuloUserRolService, 'createUserRolService').callsFake(async (modulo) => {
        const { id_rol,id_user } = modulo;
        if (!id_rol || !id_user) {
          throw new Error('All fields are required');
        }
        return { id: mockUserRolId };
      });
    sinon.stub(ModuloUserRolService, 'getUserRolByIdService').returns(Promise.resolve({ id: mockUserRolId, id_rol:1 , id_user : 1}));
    sinon.stub(ModuloUserRolService, 'getUserRolListService').returns(Promise.resolve([{ id: mockUserRolId, id_rol: 1, id_user : 1 }]));
    sinon.stub(ModuloUserRolService, 'updateUserRolService').callsFake(async (mockUserRolId,modulo) => {
        const  { id_rol,id_user }  = modulo;
        if (!id_rol || !id_user) {
          throw new Error('All fields are required');
        }
        
        return {id:mockUserRolId, id_rol: 2,id_user:2 };
      })
    sinon.stub(ModuloUserRolService, 'deleteUserRolService').returns(Promise.resolve({}));
  });

  afterEach(() => {
    // Restaurar las funciones originales
    sinon.restore();
  });

  it('should create a new user rol', async () => {
    const res = await request(app)
      .post('/api/userrol')
      .send({
        id_rol: 1,
        id_user: 1
      });
      
    expect(res.status).to.equal(201);
    expect(res.body).to.have.property('id', mockUserRolId);
  });

  it('should return error if required fields are missing when creating user rol', async () => {
    const res = await request(app)
      .post('/api/userrol')
      .send({
        id_rol: null,
        id_user: 2
      });
    expect(res.status).to.equal(400);
    expect(res.body).to.have.property('error', 'All fields are required');
  });

  it('should get a single user rol', async () => {
    const res = await request(app).get(`/api/userrol/${mockUserRolId}`);
    expect(res.status).to.equal(200);
    expect(res.body).to.have.property('id', mockUserRolId);
  });

  it('should get a list of user rol', async () => {
    const res = await request(app).get('/api/userrol/list');
    expect(res.status).to.equal(200);
    expect(res.body).to.be.an('array');
  });

  it('should update a user rol', async () => {
    const res = await request(app)
      .put(`/api/userrol/${mockUserRolId}`)
      .send({
        id_rol: 2,
        id_user: 2
      });
    expect(res.status).to.equal(200);
    expect(res.body).to.have.property('id_rol', 2);
  });
  
  it('should delete a modulo', async () => {
    const res = await request(app).delete(`/api/userrol/${mockUserRolId}`);
    expect(res.status).to.equal(200);
  });

});