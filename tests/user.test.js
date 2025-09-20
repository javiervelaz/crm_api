const request = require('supertest');
const sinon = require('sinon');
const app = require('../node'); // Asegúrate de que la ruta sea correcta a tu archivo principal
const userService = require('../services/user/userService');
const authMiddleware = require('../middleware/authMiddleware'); // Middleware de autenticación
const jwt = require('jsonwebtoken');

let chai;
let expect;

describe('User API', () => {
  before(async () => {
    chai = await import('chai');
    expect = chai.expect;
  });

  let mockUserId = 'mocked-user-id';
  let adminToken;
  let userToken;

  before(() => {
    // Generar tokens para usuarios con diferentes roles
    adminToken = jwt.sign({ userId: mockUserId, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '1h' });
    userToken = jwt.sign({ userId: mockUserId, role: 'user' }, process.env.JWT_SECRET, { expiresIn: '1h' });
  });

  beforeEach(() => {
    // Mock del servicio de autenticación
    sinon.stub(userService, 'authenticate').callsFake(async (email, password) => {
      if (email === 'valid@example.com' && password === 'correctpassword') {
        // Simula un token de éxito para credenciales válidas
        const token = jwt.sign({ userId: mockUserId, email }, process.env.JWT_SECRET, { expiresIn: '1h' });
        return { token};
      }
      return { error: 'Invalid credentials' };
    });

    // Stub del middleware de autenticación
    sinon.stub(authMiddleware, 'authenticateJWT').callsFake((req, res, next) => {
      const token = req.headers.authorization.split(' ')[1];
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
      } catch (err) {
        res.status(401).json({ error: 'Unauthorized' });
      }
    });

    // Stub de las funciones del servicio de usuarios
    sinon.stub(userService, 'createUserService').callsFake(async (user) => {
      const { nombre, apellido, email, user_type_id } = user;
      if (!nombre || !apellido || !email) {
        throw new Error('All fields are required');
      }
      if (!userService.validateEmail(email)) {
        throw new Error('Invalid email format');
      }
      return { id: mockUserId };
    });

    sinon.stub(userService, 'getUserByIdService').returns(Promise.resolve({ id: mockUserId, nombre: 'Juan', apellido: 'Perez', email: "javier@gmai.com", user_type_id:1 }));
    sinon.stub(userService, 'getUserListService').returns(Promise.resolve([{ id: mockUserId, nombre: 'Pedro', apellido: 'Perez', email: "javier@gmai.com", user_type_id:1 }]));
    sinon.stub(userService, 'updateUserService').callsFake(async (mockUserId, user) => {
      const {  nombre, apellido, email, user_type_id } = user;
      if (!nombre || !apellido || !email) {
        throw new Error('All fields are required');
      }
      if (!userService.validateEmail(email)) {
        throw new Error('Invalid email format');
      }
      return { id: mockUserId, nombre: "Juanito" };
    });
    sinon.stub(userService, 'deleteUserService').returns(Promise.resolve({}));
  });

  afterEach(() => {
    // Restaurar las funciones originales
    sinon.restore();
  });

  it('should create a new user', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        nombre: 'Juan',
        apellido: 'Perez',
        email: 'javier@gmail.xom',
        user_type_id:1
      });
      
    expect(res.status).to.equal(201);
    expect(res.body).to.have.property('id', mockUserId);
  });

  it('should return error if required fields are missing when creating user', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        nombre: '',
        apellido: '',
        email: '',
        user_type_id:null
      });
    expect(res.status).to.equal(400);
    expect(res.body).to.have.property('error', 'All fields are required');
  });

  it('should return error if email format is invalid', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        nombre: 'Juan',
        apellido: 'Perez',
        email: 'invalid-email',
        user_type_id:1
      });

    expect(res.status).to.equal(400);
    expect(res.body).to.have.property('error', 'Invalid email format');
  });

  it('should get a single user', async () => {
    const res = await request(app)
      .get(`/api/users/${mockUserId}`)
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).to.equal(200);
    expect(res.body).to.have.property('id', mockUserId);
  });

  it('should get a list of users', async () => {
    const res = await request(app)
      .get('/api/users/list')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).to.equal(200);
    expect(res.body).to.be.an('array');
  });

  it('should update a user', async () => {
    const res = await request(app)
      .put(`/api/users/${mockUserId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        nombre: 'Juanito',
        apellido: 'Perez',
        email: "javier@gmail.com",
        user_type_id:1
      });
    expect(res.status).to.equal(200);
    expect(res.body).to.have.property('nombre', 'Juanito');
  });

  it('should delete a user', async () => {
    const res = await request(app)
      .delete(`/api/users/${mockUserId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).to.equal(200);
  });

  it('should return error if a user without admin role tries to delete a user', async () => {
    const res = await request(app)
      .delete(`/api/users/${mockUserId}`)
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).to.equal(403);
    expect(res.body).to.have.property('error', 'Insufficient permissions');
  });

  it('should return error for invalid login credentials', function(done) {
    this.timeout(10000); // Aumenta el tiempo de espera a 10000 ms
    console.log('Starting test for invalid login credentials...');
    request(app)
      .post('/api/auth/login')
      .send({
        email: 'invalid@example.com',
        password: 'wrongpassword'
      })
      .then((res) => {
        console.log('Response received:', res.body);
        expect(res.status).to.equal(401);
        expect(res.body).to.have.property('error', 'Invalid credentials');
        done();
      })
      .catch((err) => {
        console.error('Error in request:', err);
        done(err);
      });
  });

  it('should login successfully with valid credentials', function(done) {
    this.timeout(10000); // Aumenta el tiempo de espera a 10000 ms
    console.log('Starting test for valid login credentials...');
    request(app)
      .post('/api/auth/login')
      .send({
        email: 'valid@example.com',
        password: 'correctpassword'
      })
      .then((res) => {
        expect(res.status).to.equal(200);
        expect(res.body).to.have.property('token').that.is.a('string');
        done();
      })
      .catch((err) => {
        console.error('Error in request:', err);
        done(err);
      });
  });

});
