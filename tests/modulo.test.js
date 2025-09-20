const request = require('supertest');
const sinon = require('sinon');
const app = require('../node'); // Asegúrate de que la ruta sea correcta a tu archivo principal
const ModuloService = require('../services/modulo/moduloService'); // Importa el servicio de usuarios

let chai;
let expect;

describe('modulo API', () => {
  before(async () => {
    chai = await import('chai');
    expect = chai.expect;
  });

  let mockmoduloId = 'mocked-modulo-id';

  beforeEach(() => {
    // Mock de las funciones del servicio de usuarios
    sinon.stub(ModuloService, 'createModuloService').callsFake(async (modulo) => {
        const { descripcion, status } = modulo;
        if (!descripcion || !status) {
          throw new Error('All fields are required');
        }
        return { id: mockmoduloId };
      });
    sinon.stub(ModuloService, 'getModuloByIdService').returns(Promise.resolve({ id: mockmoduloId, descripcion: 'pedidos' , status : true}));
    sinon.stub(ModuloService, 'getModuloListService').returns(Promise.resolve([{ id: mockmoduloId, descripcion: 'pedidos', status : true }]));
    sinon.stub(ModuloService, 'updateModuloService').callsFake(async (mockmoduloId,modulo) => {
        const  descripcion  = modulo;
        if (!descripcion ) {
          throw new Error('All fields are required');
        }
        
        return {id:mockmoduloId, descripcion: "facturacion" };
      })
    sinon.stub(ModuloService, 'deleteModuloService').returns(Promise.resolve({}));
  });

  afterEach(() => {
    // Restaurar las funciones originales
    sinon.restore();
  });

  it('should create a new modulo', async () => {
    const res = await request(app)
      .post('/api/modulo')
      .send({
        descripcion: 'pedidos',
        status: true
      });
      
    expect(res.status).to.equal(201);
    expect(res.body).to.have.property('id', mockmoduloId);
  });

  it('should return error if required fields are missing when creating modulo', async () => {
    const res = await request(app)
      .post('/api/modulo')
      .send({
        descripcion: '',
        status: ''
      });
    expect(res.status).to.equal(400);
    expect(res.body).to.have.property('error', 'All fields are required');
  });

  it('should get a single modulo', async () => {
    const res = await request(app).get(`/api/modulo/${mockmoduloId}`);
    expect(res.status).to.equal(200);
    expect(res.body).to.have.property('id', mockmoduloId);
  });

  it('should get a list of modulos', async () => {
    const res = await request(app).get('/api/modulo/list');
    expect(res.status).to.equal(200);
    expect(res.body).to.be.an('array');
  });

  it('should update a modulo', async () => {
    const res = await request(app)
      .put(`/api/modulo/${mockmoduloId}`)
      .send({
        descripcion: 'facturacion',
        status: false
      });
    expect(res.status).to.equal(200);
    expect(res.body).to.have.property('descripcion', 'facturacion');
  });
  
  it('should delete a modulo', async () => {
    const res = await request(app).delete(`/api/modulo/${mockmoduloId}`);
    expect(res.status).to.equal(200);
  });

});