const request = require('supertest');
const sinon = require('sinon');
const app = require('../node'); // Asegúrate de que la ruta sea correcta a tu archivo principal
const empleadoService = require('../services/empleado/empleadoService'); // Importa el servicio de usuarios

let chai;
let expect;

describe('Empleados API', () => {
  before(async () => {
    chai = await import('chai');
    expect = chai.expect;
  });

  let mockEmpId = 'mocked-empleado-id';

  beforeEach(() => {
    // Mock de las funciones del servicio de empleados
    sinon.stub(empleadoService, 'createEmpleadoService').callsFake(async (data) => {
      const { id_user, password, legajo, fecha_ingreso, rol_id } = data;
      if (!id_user || !password || !legajo || !rol_id) {
        throw new Error('All fields are required');
      }
      return { id: mockEmpId };
    });
    sinon.stub(empleadoService, 'getEmpleadoByIdService').returns(Promise.resolve({ id: mockEmpId, user_id: 1, password: "123", legajo: 1, fecha_ingreso:"2024-07-01",rol_id: 1 }));    
    sinon.stub(empleadoService, 'getEmpleadoListService').returns(Promise.resolve([{ id: mockEmpId, user_id: 1, password: "123", legajo: 1, fecha_ingreso:"2024-07-01",rol_id: 1 }]));
    sinon.stub(empleadoService, 'updateEmpleadoService').callsFake(async (mockEmpId,data) => {
      const { id_user, password, legajo, rol_id } = data;
      if ( !password || !legajo || !rol_id) {
        throw new Error('All fields are required');
      }
      
      return {id:mockEmpId, password: "537" };
    })
    sinon.stub(empleadoService, 'deleteEmpleadoService').returns(Promise.resolve({}));
  });

  afterEach(() => {
    // Restaurar las funciones originales
    sinon.restore();
  });

  it('should create a new empleado', async () => {
    const res = await request(app)
      .post('/api/empleado')
      .send({
        id_user: 1,
        password: '123',
        legajo: 1,
        fecha_ingreso: '2024-07-01',
        rol_id: 1
      });
    expect(res.status).to.equal(201);
    expect(res.body).to.have.property('id', mockEmpId);
  });

  it('should return error if required fields are missing when creating empleado', async () => {
    const res = await request(app)
      .post('/api/empleado')
      .send({
        id_user: null,
        password: null,
        legajo: null,
        fecha_ingreso: '2024-07-01',
        rol_id: null
      });
    expect(res.status).to.equal(400);
    expect(res.body).to.have.property('error', 'All fields are required');
  });

  it('should get a single empleado', async () => {
    const res = await request(app).get(`/api/empleado/${mockEmpId}`);
    expect(res.status).to.equal(200);
    expect(res.body).to.have.property('id', mockEmpId);
  });
  
  it('should get a list of empleado', async () => {
    const res = await request(app).get('/api/empleado/list');
    expect(res.status).to.equal(200);
    expect(res.body).to.be.an('array');
  });

  it('should update a empleado', async () => {
    const res = await request(app)
      .put(`/api/empleado/${mockEmpId}`)
      .send({
        password: '537',
        legajo: 1,
        fecha_ingreso: '2024-07-01',
        rol_id: 1
      });
    expect(res.status).to.equal(200);
    expect(res.body).to.have.property('password', '537');
  });
  
  it('should delete a empleado', async () => {
    const res = await request(app).delete(`/api/empleado/${mockEmpId}`);
    expect(res.status).to.equal(200);
  });
  
});
