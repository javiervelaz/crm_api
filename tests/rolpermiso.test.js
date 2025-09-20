const request = require('supertest');
const sinon = require('sinon');
const app = require('../node'); // Asegúrate de que la ruta sea correcta a tu archivo principal
const RolPermisoService = require('../services/rol_permiso/rolPermisoService'); // Importa el servicio de usuarios

let chai;
let expect;

describe('Rol permiso API', () => {
  before(async () => {
    chai = await import('chai');
    expect = chai.expect;
  });

  let mockrolPermisoId = 'mocked-rol-permiso-id';

  beforeEach(() => {
    // Mock de las funciones del servicio de usuarios
    sinon.stub(RolPermisoService, 'createRolPermisoService').callsFake(async (rol_permiso) => {
        const { id_rol,id_permiso } = rol_permiso;
        if (!id_rol || !id_permiso) {
          throw new Error('All fields are required');
        }
        return { id: mockrolPermisoId };
      });
    sinon.stub(RolPermisoService, 'getRolPermisoByIdService').returns(Promise.resolve({ id: mockrolPermisoId, id_rol: 1 , id_permiso : 1}));
    sinon.stub(RolPermisoService, 'getRolPermisoListService').returns(Promise.resolve([{ id: mockrolPermisoId,  id_rol: 1 , id_permiso : 1}]));
    sinon.stub(RolPermisoService, 'updateRolPermisoService').callsFake(async (mockrolPermisoId,permiso) => {
        const {id_rol,id_permiso}   = permiso;
        if (!id_rol || !id_permiso ) {
          throw new Error('All fields are required');
        }
        
        return {id:mockrolPermisoId, id_rol: 2,id_permiso: 2 };
      })
    sinon.stub(RolPermisoService, 'deleteRolPermisoService').returns(Promise.resolve({}));
  });

  afterEach(() => {
    // Restaurar las funciones originales
    sinon.restore();
  });

  it('should create a new rol permiso', async () => {
    const res = await request(app)
      .post('/api/rolpermiso')
      .send({
        id_rol: 1,
        id_permiso: 1
      });
      
    expect(res.status).to.equal(201);
    expect(res.body).to.have.property('id', mockrolPermisoId);
  });

  it('should return error if required fields are missing when creating rol permiso', async () => {
    const res = await request(app)
      .post('/api/rolpermiso')
      .send({
        id_rol: null,
        id_permiso: null
      });
    expect(res.status).to.equal(400);
    expect(res.body).to.have.property('error', 'All fields are required');
  });

  it('should get a single rol permiso', async () => {
    const res = await request(app).get(`/api/rolpermiso/${mockrolPermisoId}`);
    expect(res.status).to.equal(200);
    expect(res.body).to.have.property('id', mockrolPermisoId);
  });

  it('should get a list of permisos', async () => {
    const res = await request(app).get('/api/rolpermiso/list');
    expect(res.status).to.equal(200);
    expect(res.body).to.be.an('array');
  });

  it('should update a permiso', async () => {
    const res = await request(app)
      .put(`/api/rolpermiso/${mockrolPermisoId}`)
      .send({
        id_rol: 2,
        id_permiso: 2
      });
    expect(res.status).to.equal(200);
    expect(res.body).to.have.property('id_rol', 2);
  });
  
  it('should delete a permiso', async () => {
    const res = await request(app).delete(`/api/rolpermiso/${mockrolPermisoId}`);
    expect(res.status).to.equal(200);
  });

});