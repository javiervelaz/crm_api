const request = require('supertest');
const sinon = require('sinon');
const app = require('../node'); // Asegúrate de que la ruta sea correcta a tu archivo principal
const profileService = require('../services/profile/profileService'); // Importa el servicio de usuarios

let chai;
let expect;

describe('Profile API', () => {
  before(async () => {
    chai = await import('chai');
    expect = chai.expect;
  });

  let mockEmpId = 'mocked-profile-id';

  beforeEach(() => {
    // Mock de las funciones del servicio de empleados
    sinon.stub(profileService, 'createProfileService').callsFake(async (data) => {
      const { id_user, telefono, password, legajo} = data;
      if (!id_user || !password || !legajo || !telefono) {
        throw new Error('All fields are required');
      }
      return { id: mockEmpId };
    });
    sinon.stub(profileService, 'getProfileByIdService').returns(Promise.resolve({ id: mockEmpId, user_id: 1,dni:123,telefono:123, password: "123", legajo: 1, fecha_ingreso:"2024-07-01"}));    
    sinon.stub(profileService, 'getProfileListService').returns(Promise.resolve([{ id: mockEmpId, user_id: 1,dni:123,telefono:123, password: "123", legajo: 1, fecha_ingreso:"2024-07-01" }]));
    sinon.stub(profileService, 'updateProfileService').callsFake(async (mockEmpId,data) => {
      const { telefono, password, legajo } = data;
      if ( !password || !legajo || !telefono) {
        throw new Error('All fields are required');
      }
      
      return {id:mockEmpId, password: "537" };
    })
    sinon.stub(profileService, 'deleteProfileService').returns(Promise.resolve({}));
  });

  afterEach(() => {
    // Restaurar las funciones originales
    sinon.restore();
  });

  it('should create a new profile', async () => {
    const res = await request(app)
      .post('/api/profile')
      .send({
        id_user: 1,
        telefono:123,
        password: '123',
        legajo: 1,
        fecha_ingreso: '2024-07-01'
      });
    expect(res.status).to.equal(201);
    expect(res.body).to.have.property('id', mockEmpId);
  });

  it('should return error if required fields are missing when creating profile', async () => {
    const res = await request(app)
      .post('/api/profile')
      .send({
        id_user: null,
        telefono: null,
        password: null,
        legajo: null,
        fecha_ingreso: '2024-07-01',
      });
    expect(res.status).to.equal(400);
    expect(res.body).to.have.property('error', 'All fields are required');
  });

  it('should get a single empleado', async () => {
    const res = await request(app).get(`/api/profile/${mockEmpId}`);
    expect(res.status).to.equal(200);
    expect(res.body).to.have.property('id', mockEmpId);
  });
  
  it('should get a list of empleado', async () => {
    const res = await request(app).get('/api/profile/list');
    expect(res.status).to.equal(200);
    expect(res.body).to.be.an('array');
  });

  it('should update a profile', async () => {
    const res = await request(app)
      .put(`/api/profile/${mockEmpId}`)
      .send({
        telefono: 123,
        password: '537',
        legajo: 1,
        fecha_ingreso: '2024-07-01',
      });
    expect(res.status).to.equal(200);
    expect(res.body).to.have.property('password', '537');
  });
  
  it('should delete a profile', async () => {
    const res = await request(app).delete(`/api/profile/${mockEmpId}`);
    expect(res.status).to.equal(200);
  });
  
});
