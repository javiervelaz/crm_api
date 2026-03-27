const request = require('supertest');
const sinon = require('sinon');
const app = require('../node');
const medioPagoService = require('../services/medio_pago/medioPagoService');

let chai;
let expect;

describe('MedioPago API', () => {
  before(async () => {
    chai = await import('chai');
    expect = chai.expect;
  });

  const mockMedioPagoId = 'mocked-medio-pago-id';

  beforeEach(() => {
    sinon.stub(medioPagoService, 'createMedioPagoService').callsFake(async (data) => {
      const { descripcion } = data;
      if (!descripcion) {
        throw new Error('All fields are required');
      }
      return { id: mockMedioPagoId, descripcion };
    });

    sinon.stub(medioPagoService, 'getMedioPagoByIdService').callsFake(async (id) => {
      return { id: mockMedioPagoId, descripcion: 'Efectivo' };
    });

    sinon.stub(medioPagoService, 'getMedioPagoListService').callsFake(async () => {
      return [
        { id: mockMedioPagoId, descripcion: 'Efectivo' },
        { id: 'id-2', descripcion: 'Tarjeta' },
      ];
    });

    sinon.stub(medioPagoService, 'updateMedioPagoService').callsFake(async (id, data) => {
      const { descripcion } = data;
      if (!descripcion) {
        throw new Error('All fields are required');
      }
      return { id, descripcion };
    });

    sinon.stub(medioPagoService, 'deleteMedioPagoService').callsFake(async (id) => {
      return { message: 'MedioPago eliminado' };
    });
  });

  afterEach(() => {
    sinon.restore();
  });

  // CREATE
  it('should create a new medio de pago', async () => {
    const res = await request(app)
      .post('/api/medioPago')
      .send({ descripcion: 'Efectivo' });

    expect(res.status).to.equal(201);
    expect(res.body).to.have.property('id', mockMedioPagoId);
    expect(res.body).to.have.property('descripcion', 'Efectivo');
  });

  it('should return error if descripcion is missing when creating', async () => {
    const res = await request(app)
      .post('/api/medioPago')
      .send({ descripcion: '' });

    expect(res.status).to.equal(400);
    expect(res.body).to.have.property('error', 'All fields are required');
  });

  // GET LIST
  it('should get a list of medios de pago', async () => {
    const res = await request(app)
      .get('/api/medioPago/list');

    expect(res.status).to.equal(200);
    expect(res.body).to.be.an('array');
    expect(res.body).to.have.lengthOf(2);
  });

  // GET BY ID
  it('should get a medio de pago by id', async () => {
    const res = await request(app)
      .get(`/api/medioPago/${mockMedioPagoId}`);

    expect(res.status).to.equal(200);
    expect(res.body).to.have.property('descripcion', 'Efectivo');
  });

  it('should return 404 if medio de pago not found', async () => {
    medioPagoService.getMedioPagoByIdService.restore();
    sinon.stub(medioPagoService, 'getMedioPagoByIdService').callsFake(async () => {
      return null;
    });

    const res = await request(app)
      .get('/api/medioPago/non-existent-id');

    expect(res.status).to.equal(404);
    expect(res.body).to.have.property('error', 'MedioPago not found');
  });

  // UPDATE
  it('should update a medio de pago', async () => {
    const res = await request(app)
      .put(`/api/medioPago/${mockMedioPagoId}`)
      .send({ descripcion: 'Transferencia' });

    expect(res.status).to.equal(200);
    expect(res.body).to.have.property('descripcion', 'Transferencia');
  });

  it('should return error if descripcion is missing when updating', async () => {
    const res = await request(app)
      .put(`/api/medioPago/${mockMedioPagoId}`)
      .send({ descripcion: '' });

    expect(res.status).to.equal(500);
    expect(res.body).to.have.property('error', 'All fields are required');
  });

  // DELETE
  it('should delete a medio de pago', async () => {
    const res = await request(app)
      .delete(`/api/medioPago/${mockMedioPagoId}`);

    expect(res.status).to.equal(200);
  });
});
