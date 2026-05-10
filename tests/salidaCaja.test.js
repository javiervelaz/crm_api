const request = require('supertest');
const sinon = require('sinon');
const app = require('../node');
const salidaCajaService = require('../services/salidaCaja/salidaCajaService');

let chai;
let expect;

describe('SalidaCaja API', () => {
  before(async () => {
    chai = await import('chai');
    expect = chai.expect;
  });

  const mockSalidaId = 'mocked-salida-id';
  const mockClienteId = 'mocked-cliente-id';
  const mockRegistroDiarioId = 'mocked-registro-id';

  beforeEach(() => {
    sinon.stub(salidaCajaService, 'createSalidaCajaService').callsFake(async (dataArray) => {
      if (!Array.isArray(dataArray) || dataArray.length === 0) {
        throw new Error('Se debe enviar un array con al menos un elemento');
      }
      return dataArray.map((data, index) => {
        const { registro_diario_id, categoria_salida_id, descripcion, monto, usuario_id, cliente_id } = data;
        if (!descripcion || !monto || !registro_diario_id || !categoria_salida_id || !usuario_id) {
          throw new Error('Todos los campos son requeridos por cada registro');
        }
        return { id: `salida-${index}`, ...data };
      });
    });

    sinon.stub(salidaCajaService, 'getSalidaCajaByIdService').callsFake(async (id, cliente_id) => {
      return { id: mockSalidaId, descripcion: 'Compra insumos', monto: 5000, cliente_id };
    });

    sinon.stub(salidaCajaService, 'getSalidaCajaListService').callsFake(async (id, cliente_id) => {
      return [
        { id: mockSalidaId, descripcion: 'Compra insumos', monto: 5000, cliente_id },
        { id: 'salida-2', descripcion: 'Pago servicios', monto: 3000, cliente_id },
      ];
    });

    sinon.stub(salidaCajaService, 'updateSalidaCajaService').callsFake(async (id, data) => {
      const { descripcion } = data;
      if (!descripcion) {
        throw new Error('All fields are required');
      }
      return { id, ...data };
    });

    sinon.stub(salidaCajaService, 'deleteSalidaCajaService').callsFake(async (id, cliente_id) => {
      return { message: 'SalidaCaja eliminada' };
    });

    sinon.stub(salidaCajaService, 'getMontoGastosdService').callsFake(async (id, salida_categoria_id, cliente_id) => {
      return { total: 8000 };
    });
  });

  afterEach(() => {
    sinon.restore();
  });

  // CREATE
  it('should create salidas de caja', async () => {
    const res = await request(app)
      .post('/api/salida-caja')
      .send([
        {
          registro_diario_id: mockRegistroDiarioId,
          categoria_salida_id: 1,
          descripcion: 'Compra insumos',
          monto: 5000,
          usuario_id: 'user-1',
          cliente_id: mockClienteId,
        },
      ]);

    expect(res.status).to.equal(201);
    expect(res.body).to.be.an('array');
    expect(res.body).to.have.lengthOf(1);
    expect(res.body[0]).to.have.property('descripcion', 'Compra insumos');
  });

  it('should return error if array is empty when creating', async () => {
    const res = await request(app)
      .post('/api/salida-caja')
      .send([]);

    expect(res.status).to.equal(400);
    expect(res.body).to.have.property('error', 'Se debe enviar un array con al menos un elemento');
  });

  it('should return error if required fields are missing in a registro', async () => {
    const res = await request(app)
      .post('/api/salida-caja')
      .send([
        {
          registro_diario_id: mockRegistroDiarioId,
          categoria_salida_id: 1,
          descripcion: '',
          monto: null,
          usuario_id: 'user-1',
          cliente_id: mockClienteId,
        },
      ]);

    expect(res.status).to.equal(400);
    expect(res.body).to.have.property('error', 'Todos los campos son requeridos por cada registro');
  });

  // GET LIST
  it('should get a list of salidas de caja', async () => {
    const res = await request(app)
      .get(`/api/salida-caja/list/${mockRegistroDiarioId}/${mockClienteId}`);

    expect(res.status).to.equal(200);
    expect(res.body).to.be.an('array');
    expect(res.body).to.have.lengthOf(2);
  });

  // GET BY ID
  it('should get a salida de caja by id', async () => {
    const res = await request(app)
      .get(`/api/salida-caja/${mockSalidaId}/${mockClienteId}`);

    expect(res.status).to.equal(200);
    expect(res.body).to.have.property('descripcion', 'Compra insumos');
    expect(res.body).to.have.property('monto', 5000);
  });

  it('should return 404 if salida de caja not found', async () => {
    salidaCajaService.getSalidaCajaByIdService.restore();
    sinon.stub(salidaCajaService, 'getSalidaCajaByIdService').callsFake(async () => {
      return null;
    });

    const res = await request(app)
      .get(`/api/salida-caja/non-existent/${mockClienteId}`);

    expect(res.status).to.equal(404);
    expect(res.body).to.have.property('error', 'SalidaCaja not found');
  });

  // UPDATE
  it('should update a salida de caja', async () => {
    const res = await request(app)
      .put(`/api/salida-caja/${mockSalidaId}`)
      .send({
        descripcion: 'Compra actualizada',
        monto: 6000,
        cliente_id: mockClienteId,
      });

    expect(res.status).to.equal(200);
    expect(res.body).to.have.property('descripcion', 'Compra actualizada');
    expect(res.body).to.have.property('monto', 6000);
  });

  it('should return error if descripcion is missing when updating', async () => {
    const res = await request(app)
      .put(`/api/salida-caja/${mockSalidaId}`)
      .send({
        descripcion: '',
        monto: 6000,
        cliente_id: mockClienteId,
      });

    expect(res.status).to.equal(500);
    expect(res.body).to.have.property('error', 'All fields are required');
  });

  // DELETE
  it('should delete a salida de caja', async () => {
    const res = await request(app)
      .delete(`/api/salida-caja/${mockSalidaId}/${mockClienteId}`);

    expect(res.status).to.equal(200);
  });

  // GET MONTO GASTOS
  it('should get monto de gastos', async () => {
    const res = await request(app)
      .post(`/api/salida-caja/monto-gastos/${mockRegistroDiarioId}`)
      .send({
        salida_categoria_id: 1,
        cliente_id: mockClienteId,
      });

    expect(res.status).to.equal(200);
    expect(res.body).to.have.property('total', 8000);
  });
});
