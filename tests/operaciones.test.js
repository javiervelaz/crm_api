const request = require('supertest');
const sinon = require('sinon');
const app = require('../node'); // Asegúrate de que la ruta sea correcta a tu archivo principal
const operacionesService = require('../services/operaciones_diarias/operacionesDiariasService'); // Importa el servicio de operaciones
const InventarioInsumosService = require('../services/inventario_insumo/inventarioInsumoService'); // Importa el modelo de InventarioInsumos
const MovimientoInventario = require('../services/movimiento_inventario/movimientoInventarioService'); // Importa el modelo correspondiente

let chai;
let expect;

describe('Operaciones Diarias API', () => {
  before(async () => {
    chai = await import('chai');
    expect = chai.expect;
  });

  let mockopId = 'mocked-op-id';

  beforeEach(() => {
    sinon.stub(operacionesService, 'registrarAperturaCierreCaja').callsFake(async (abrirCaja) => {
        return { id: mockopId  };
    });

    sinon.stub(operacionesService, 'registrarCompraInsumo').callsFake(async (compraIn) => {
        return { id: mockopId };
    });

    // Mock ajustado para 'actualizarInventarioInsumos'
    sinon.stub(operacionesService, 'actualizarInventarioInsumos').callsFake(async (id, compraIn) => {
        const { sucursal_id, nombre, cantidad } = compraIn;
        if (id === 1) {
            return { id: 1, nombre: 'harina', sucursal_id: 1, cantidad: 10 }; // Simulación para actualizar inventario existente
        } else {
            return await InventarioInsumosService.createInventarioInsumoService({ nombre, sucursal_id, cantidad });
        }
    });

    sinon.stub(InventarioInsumosService, 'createInventarioInsumoService').callsFake(async (nuevoInsumo) => {
        return { id: 2, nombre: nuevoInsumo.nombre, sucursal_id: nuevoInsumo.sucursal_id, cantidad: nuevoInsumo.cantidad }; // Simulación correcta de creación de nuevo insumo
    });

    /////
    sinon.stub(operacionesService, 'registrarMovimientoInventario').callsFake(async (inventarioInsumosId, registroDiarioId, tipoMovimiento, cantidad) => {
        return { id: mockopId, tipo_movimiento: 'entrada', cantidad: 10 };
    });

    sinon.stub(operacionesService, 'registrarSalidaCaja').callsFake(async (registroDiarioId, categoria, descripcion, monto, usuarioId, sucursalId) => {
        return { id: mockopId, categoria: 'compra', monto: 500 };
    });

    sinon.stub(operacionesService, 'crearPedido').callsFake(async (registroDiarioId, montoTotal, usuarioId, sucursalId) => {
        return { id: mockopId, monto_total: 1000 };
    });

  });

  afterEach(() => {
    sinon.restore();
  });

  it('should create a new operacion diaria', async () => {
    const res = await request(app)
      .post('/api/operaciones/abrir-caja')
      .send({
        fecha: '2024-02-02',
        usuario_apertura_id: 1,
        caja_inicial: 100,
        sucursal_id: 1
      });
      
    expect(res.status).to.equal(201);
    expect(res.body).to.have.property('id', mockopId);
  });

  it('should create a new compra insumo', async () => {
    const res = await request(app)
      .post('/api/operaciones/registrar-compra-insumo')
      .send({
        registroDiarioId: 1,
        insumo: 'harina',
        cantidad: 2,
        precioTotal: 200,
        usuarioId: 1,
        sucursalId: 1
      });
      
    expect(res.status).to.equal(201);
    expect(res.body).to.have.property('id', mockopId);
  });

  it('should update inventory insumo', async () => {
    const res = await request(app)
      .put('/api/operaciones/actualizar-inventario-insumos/1')
      .send({
        sucursal_id: 1,
        nombre: 'harina',
        cantidad: 12
      });
    expect(res.body).to.have.property('cantidad', 12); 
  });

  it('should create new inventory insumo if not found', async () => {
    const res = await request(app)
      .put('/api/operaciones/actualizar-inventario-insumos/2')
      .send({
        sucursal_id: 1,
        nombre: 'aceite',
        cantidad: 5
      });
    expect(res.status).to.equal(200);
    expect(res.body).to.have.property('id', 2);
    expect(res.body).to.have.property('nombre', 'aceite');
  });


  it('should register a new inventory movement', async () => {
    const res = await request(app)
      .post('/api/operaciones/registrar-movimiento-inventario')
      .send({
        inventario_insumos_id: 1,
        registro_diario_id: 1,
        tipo_movimiento: 'entrada',
        cantidad: 10
      });

    expect(res.status).to.equal(201);
    expect(res.body).to.have.property('id', mockopId);
    expect(res.body).to.have.property('tipo_movimiento', 'entrada');
    expect(res.body).to.have.property('cantidad', 10);
  });

  it('should register a new cash withdrawal', async () => {
    const res = await request(app)
      .post('/api/operaciones/registrar-salida-caja')
      .send({
        registroDiarioId: 1,
        categoria: 'compra',
        descripcion: 'compra de materiales',
        monto: 500,
        usuarioId: 1,
        sucursalId: 1
      });

    expect(res.status).to.equal(201);
    expect(res.body).to.have.property('id', mockopId);
    expect(res.body).to.have.property('categoria', 'compra');
    expect(res.body).to.have.property('monto', 500);
  });

  it('should register a new order', async () => {
    const res = await request(app)
      .post('/api/operaciones/crear-pedido')
      .send({
        registroDiarioId: 1,
        montoTotal: 1000,
        usuarioId: 1,
        sucursalId: 1
      });

    expect(res.status).to.equal(201);
    expect(res.body).to.have.property('id', mockopId);
    expect(res.body).to.have.property('monto_total', 1000);
  });

});
