const request = require('supertest');
const sinon = require('sinon');
const app = require('../node'); // Asegúrate de que la ruta sea correcta a tu archivo principal
const PermisoService = require('../services/permiso/permisoService'); // Importa el servicio de usuarios

let chai;
let expect;

describe('permiso API', () => {
  before(async () => {
    chai = await import('chai');
    expect = chai.expect;
  });

  let mockpermisoId = 'mocked-permiso-id';

  beforeEach(() => {
    // Mock de las funciones del servicio de usuarios
    sinon.stub(PermisoService, 'createPermisoService').callsFake(async (permiso) => {
        const { nombre,descripcion } = permiso;
        if (!descripcion || !nombre) {
          throw new Error('All fields are required');
        }
        return { id: mockpermisoId };
      });
    sinon.stub(PermisoService, 'getPermisoByIdService').returns(Promise.resolve({ id: mockpermisoId, descripcion: 'usuario' , nombre : "usuario"}));
    sinon.stub(PermisoService, 'getPermisoListService').returns(Promise.resolve([{ id: mockpermisoId, descripcion: 'usuario', nombre : "usuario" }]));
    sinon.stub(PermisoService, 'updatePermisoService').callsFake(async (mockpermisoId,permiso) => {
        const {nombre,descripcion}   = permiso;
        if (!descripcion || !nombre ) {
          throw new Error('All fields are required');
        }
        
        return {id:mockpermisoId, descripcion: "dios",nombre: "dios" };
      })
    sinon.stub(PermisoService, 'deletePermisoService').returns(Promise.resolve({}));
  });

  afterEach(() => {
    // Restaurar las funciones originales
    sinon.restore();
  });

  it('should create a new permiso', async () => {
    const res = await request(app)
      .post('/api/permiso')
      .send({
        descripcion: 'usuario',
        nombre: "usuario"
      });
      
    expect(res.status).to.equal(201);
    expect(res.body).to.have.property('id', mockpermisoId);
  });

  it('should return error if required fields are missing when creating permiso', async () => {
    const res = await request(app)
      .post('/api/permiso')
      .send({
        descripcion: '',
        nombre: ''
      });
    expect(res.status).to.equal(400);
    expect(res.body).to.have.property('error', 'All fields are required');
  });

  it('should get a single permiso', async () => {
    const res = await request(app).get(`/api/permiso/${mockpermisoId}`);
    expect(res.status).to.equal(200);
    expect(res.body).to.have.property('id', mockpermisoId);
  });

  it('should get a list of permisos', async () => {
    const res = await request(app).get('/api/permiso/list');
    expect(res.status).to.equal(200);
    expect(res.body).to.be.an('array');
  });

  it('should update a permiso', async () => {
    const res = await request(app)
      .put(`/api/permiso/${mockpermisoId}`)
      .send({
        descripcion: 'dios',
        nombre: 'dios'
      });
    expect(res.status).to.equal(200);
    expect(res.body).to.have.property('descripcion', 'dios');
  });
  
  it('should delete a permiso', async () => {
    const res = await request(app).delete(`/api/permiso/${mockpermisoId}`);
    expect(res.status).to.equal(200);
  });

});