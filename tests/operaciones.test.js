const request = require('supertest');
const sinon = require('sinon');
const jwt = require('jsonwebtoken');
const app = require('../node');
const operacionesService = require('../services/operaciones_diarias/operacionesDiariasService');
const planService = require('../services/cliente/planService');
const pool = require('../pool');

let chai;
let expect;

describe('Operaciones Diarias API', () => {
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
        modules: ['operaciones'],
        permissions: {
          operaciones: ['operaciones.list', 'operaciones.delete', 'operaciones.create'],
        },
      },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
  });

  let mockopId = 'mocked-op-id';

  beforeEach(() => {
    // requireLimit: plan sin limite pasa directamente
    sinon.stub(planService, 'getClienteTierAndFeatures').resolves({
      features: { maxPedidosMensuales: null },
      tierCode: 'FREE',
    });
    sinon.stub(pool, 'query').resolves({ rows: [{ count: '0' }] });

    sinon.stub(operacionesService, 'registrarAperturaCierreCaja').callsFake(async (abrirCaja) => {
      return { id: mockopId };
    });

    sinon.stub(operacionesService, 'registrarSalidaCaja').callsFake(async (registroDiarioId, categoria, descripcion, monto, usuarioId, sucursalId) => {
      return { id: mockopId, categoria: 'compra', monto: 500 };
    });

    sinon.stub(operacionesService, 'crearPedido').callsFake(async (body) => {
      return { id: mockopId, monto_total: 1000 };
    });
  });

  afterEach(() => {
    sinon.restore();
  });

  it('should create a new operacion diaria', async () => {
    const res = await request(app)
      .post('/api/operaciones/abrir-caja')
      .set('Authorization', 'Bearer ' + adminToken)
      .send({
        fecha: '2024-02-02',
        usuario_apertura_id: 1,
        caja_inicial: 100,
        sucursal_id: 1,
      });
    expect(res.status).to.equal(201);
    expect(res.body).to.have.property('id', mockopId);
  });

  it('should register a new cash withdrawal', async () => {
    const res = await request(app)
      .post('/api/operaciones/registrar-salida-caja')
      .set('Authorization', 'Bearer ' + adminToken)
      .send({
        registroDiarioId: 1,
        categoria: 'compra',
        descripcion: 'compra de materiales',
        monto: 500,
        usuarioId: 1,
        sucursalId: 1,
      });
    expect(res.status).to.equal(201);
    expect(res.body).to.have.property('id', mockopId);
    expect(res.body).to.have.property('categoria', 'compra');
    expect(res.body).to.have.property('monto', 500);
  });

  it('should register a new order', async () => {
    const res = await request(app)
      .post('/api/operaciones/crear-pedido')
      .set('Authorization', 'Bearer ' + adminToken)
      .send({
        registroDiarioId: 1,
        montoTotal: 1000,
        usuarioId: 1,
        sucursalId: 1,
      });
    expect(res.status).to.equal(201);
    expect(res.body).to.have.property('status', 'OK');
    expect(res.body.idPedido).to.have.property('id', mockopId);
    expect(res.body.idPedido).to.have.property('monto_total', 1000);
  });
});
