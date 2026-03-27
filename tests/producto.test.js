const request = require('supertest');
const sinon = require('sinon');
const app = require('../node');
const productoService = require('../services/producto/productoService');
const authMiddleware = require('../middleware/authMiddleware');
const moduleAuth = require('../middleware/moduleAuth');
const permissionMiddleware = require('../middleware/permissionMiddleware');
const limitMiddleware = require('../middleware/limitMiddleware');
const jwt = require('jsonwebtoken');

let chai;
let expect;

describe('Producto API', () => {
  before(async () => {
    chai = await import('chai');
    expect = chai.expect;
  });

  const mockUserId = 'mocked-user-id';
  const mockClienteId = 'mocked-cliente-id';
  let adminToken;

  before(() => {
    adminToken = jwt.sign(
      {
        userId: mockUserId,
        role: 'admin',
        cliente_id: mockClienteId,
        modules: ['productos'],
        permissions: { productos: ['productos.create', 'productos.list', 'productos.update', 'productos.delete'] },
      },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
  });

  beforeEach(() => {
    // Stub auth middleware
    sinon.stub(authMiddleware, 'authenticateJWT').callsFake((req, res, next) => {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(403).json({ error: 'Access denied' });
      }
      const token = authHeader.split(' ')[1];
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
      } catch (err) {
        res.status(403).json({ error: 'Invalid token' });
      }
    });

    // Stub module auth middleware
    sinon.stub(moduleAuth, 'authorizeModule').callsFake((requiredModule) => (req, res, next) => {
      const userModules = req.user?.modules || [];
      if (!userModules.includes(requiredModule)) {
        return res.status(403).json({ error: 'No tiene acceso a este módulo' });
      }
      next();
    });

    // Stub permission middleware
    sinon.stub(permissionMiddleware, 'authorizePermission').callsFake((moduleCode, permissionCodes) => (req, res, next) => {
      const userPermissions = req.user?.permissions || {};
      const modulePermissions = userPermissions[moduleCode] || [];
      const required = Array.isArray(permissionCodes) ? permissionCodes : [permissionCodes];
      const hasPermission = required.some((p) => modulePermissions.includes(p));
      if (!hasPermission) {
        return res.status(403).json({ error: 'Acción no permitida' });
      }
      next();
    });

    // Stub limit middleware
    sinon.stub(limitMiddleware, 'requireLimit').callsFake(() => (req, res, next) => {
      next();
    });

    // Stub service methods
    sinon.stub(productoService, 'createProductoService').callsFake(async (data) => {
      const { nombre, precio_unitario } = data;
      if (!nombre || !precio_unitario) {
        throw new Error('All fields are required');
      }
      return { id: 'mocked-producto-id', nombre, precio_unitario };
    });

    sinon.stub(productoService, 'getProductoByIdService').callsFake(async (id, cliente_id) => {
      return { id, nombre: 'Pizza', precio_unitario: 1500, cliente_id };
    });

    sinon.stub(productoService, 'getProductoListService').callsFake(async (cliente_id) => {
      return [
        { id: '1', nombre: 'Pizza', precio_unitario: 1500, cliente_id },
        { id: '2', nombre: 'Empanada', precio_unitario: 500, cliente_id },
      ];
    });

    sinon.stub(productoService, 'updateProductoService').callsFake(async (id, data) => {
      return { id, ...data };
    });

    sinon.stub(productoService, 'deleteProductoService').callsFake(async (id, cliente_id) => {
      return { message: 'Producto eliminado' };
    });
  });

  afterEach(() => {
    sinon.restore();
  });

  // CREATE
  it('should create a new producto', async () => {
    const res = await request(app)
      .post('/api/producto')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        nombre: 'Pizza',
        precio_unitario: 1500,
        tipo_producto_id: 1,
        permite_mitad: true,
        cliente_id: mockClienteId,
      });

    expect(res.status).to.equal(201);
    expect(res.body).to.have.property('nombre', 'Pizza');
    expect(res.body).to.have.property('precio_unitario', 1500);
  });

  it('should return error if required fields are missing when creating producto', async () => {
    const res = await request(app)
      .post('/api/producto')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        nombre: '',
        precio_unitario: null,
      });

    expect(res.status).to.equal(400);
    expect(res.body).to.have.property('error', 'All fields are required');
  });

  it('should return 403 if no authorization token is provided', async () => {
    const res = await request(app)
      .post('/api/producto')
      .send({
        nombre: 'Pizza',
        precio_unitario: 1500,
      });

    expect(res.status).to.equal(403);
  });

  // GET LIST
  it('should get a list of productos', async () => {
    const res = await request(app)
      .get(`/api/producto/list/${mockClienteId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).to.equal(200);
    expect(res.body).to.be.an('array');
    expect(res.body).to.have.lengthOf(2);
  });

  // GET BY ID
  it('should get a producto by id', async () => {
    const res = await request(app)
      .get(`/api/producto/prod-1/${mockClienteId}`);

    expect(res.status).to.equal(200);
    expect(res.body).to.have.property('nombre', 'Pizza');
  });

  it('should return 404 if producto not found', async () => {
    productoService.getProductoByIdService.restore();
    sinon.stub(productoService, 'getProductoByIdService').callsFake(async () => {
      return null;
    });

    const res = await request(app)
      .get(`/api/producto/non-existent/${mockClienteId}`);

    expect(res.status).to.equal(404);
    expect(res.body).to.have.property('error', 'Producto not found');
  });

  // UPDATE
  it('should update a producto', async () => {
    const res = await request(app)
      .put('/api/producto/prod-1')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        nombre: 'Pizza Grande',
        precio_unitario: 2000,
        tipo_producto_id: 1,
        permite_mitad: true,
        cliente_id: mockClienteId,
      });

    expect(res.status).to.equal(200);
    expect(res.body).to.have.property('nombre', 'Pizza Grande');
  });

  // DELETE
  it('should delete a producto', async () => {
    const res = await request(app)
      .delete(`/api/producto/prod-1/${mockClienteId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).to.equal(200);
  });
});
