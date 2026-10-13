// tests/tipoDerivado.test.js
// Bug CP-05 (etapa 3): el tipo de usuario deja de elegirse en el alta y se
// deriva de los roles (migrations/012_rol_user_type.sql, model/users/tipo.js).
const request = require('supertest');
const sinon = require('sinon');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-tests';
const app = require('../node');
const userDb = require('../model/users/db');
const userRolDb = require('../model/user_rol/db');
const tipoDb = require('../model/users/tipo');

let expect;
before(async () => { ({ expect } = await import('chai')); });
afterEach(() => sinon.restore());

const token = (over = {}) => jwt.sign({
  userId: 7, cliente_id: 40, username: 'x', role: ['admin'], modules: ['usuarios'],
  permissions: { usuarios: ['usuarios.create', 'usuarios.update', 'usuarios.list', 'usuarios.delete'] },
  tipo: 'ADMIN', debeCambiarPassword: false, ...over,
}, process.env.JWT_SECRET, { expiresIn: '1h' });
const auth = (over) => ({ Authorization: `Bearer ${token(over)}` });

describe('Alta y edición de usuario sin tipo', () => {
  it('POST /api/users ignora user_type_id del body: arranca como empleado y con el tenant del JWT', async () => {
    sinon.stub(tipoDb, 'getUserTypeIdPorCodigo').withArgs('EMP').resolves(2);
    const crear = sinon.stub(userDb, 'createUser').callsFake(async (u) => ({ id: 90, ...u }));

    const res = await request(app).post('/api/users').set(auth())
      .send({ nombre: 'Laura', apellido: 'Gómez', email: 'laura@ejemplo.com', user_type_id: 1 });

    expect(res.status).to.equal(201);
    expect(crear.firstCall.args[0]).to.include({ user_type_id: 2, cliente_id: 40 });
  });

  it('PUT /api/users/:id no toca el tipo y filtra por tenant', async () => {
    const upd = sinon.stub(userDb, 'updateUser').resolves({ id: 90 });

    const res = await request(app).put('/api/users/90').set(auth())
      .send({ nombre: 'Laura', apellido: 'Gómez', email: 'laura@ejemplo.com', user_type_id: 1 });

    expect(res.status).to.equal(200);
    const [id, datos, clienteId] = upd.firstCall.args;
    expect(String(id)).to.equal('90');
    expect(datos).to.deep.equal({ nombre: 'Laura', apellido: 'Gómez', email: 'laura@ejemplo.com' });
    expect(clienteId).to.equal(40);
  });

  it('PUT /api/users/:id de otro tenant → 404', async () => {
    sinon.stub(userDb, 'updateUser').resolves(undefined);
    const res = await request(app).put('/api/users/91').set(auth())
      .send({ nombre: 'Otro', apellido: 'Tenant', email: 'otro@ejemplo.com' });
    expect(res.status).to.equal(404);
  });
});

describe('Asignación de roles recalcula el tipo', () => {
  const stubOk = () => {
    sinon.stub(userRolDb, 'rolDelTenant').resolves({ id: 5 });
    sinon.stub(userRolDb, 'userDelTenant').resolves({ id: 90 });
    const crear = sinon.stub(userRolDb, 'createUserRol').callsFake(async (r) => ({ id: 300, ...r }));
    const sync = sinon.stub(tipoDb, 'sincronizarTipo').resolves('PROF');
    return { crear, sync };
  };

  it('POST /api/userrol usa el tenant del JWT aunque el body no lo traiga y sincroniza el tipo', async () => {
    const { crear, sync } = stubOk();
    const res = await request(app).post('/api/userrol').set(auth()).send({ id_rol: 5, id_user: 90 });

    expect(res.status).to.equal(201);
    expect(crear.firstCall.args[0]).to.deep.equal({ id_rol: 5, id_user: 90, cliente_id: 40 });
    expect(sync.calledOnceWithExactly(90, 40)).to.equal(true);
  });

  it('rol de otro tenant → 404 ROL_NOT_FOUND, sin insertar', async () => {
    sinon.stub(userRolDb, 'rolDelTenant').resolves(null);
    const crear = sinon.stub(userRolDb, 'createUserRol');
    const res = await request(app).post('/api/userrol').set(auth()).send({ id_rol: 999, id_user: 90 });
    expect(res.status).to.equal(404);
    expect(res.body.code).to.equal('ROL_NOT_FOUND');
    expect(crear.called).to.equal(false);
  });

  it('usuario de otro tenant → 404 USER_NOT_FOUND, sin insertar', async () => {
    sinon.stub(userRolDb, 'rolDelTenant').resolves({ id: 5 });
    sinon.stub(userRolDb, 'userDelTenant').resolves(null);
    const crear = sinon.stub(userRolDb, 'createUserRol');
    const res = await request(app).post('/api/userrol').set(auth()).send({ id_rol: 5, id_user: 999 });
    expect(res.status).to.equal(404);
    expect(res.body.code).to.equal('USER_NOT_FOUND');
    expect(crear.called).to.equal(false);
  });

  it('cliente_id ajeno en el body sigue rechazado por scopeTenant', async () => {
    const res = await request(app).post('/api/userrol').set(auth()).send({ id_rol: 5, id_user: 90, cliente_id: 41 });
    expect(res.status).to.equal(403);
  });

  it('DELETE recalcula el tipo del usuario que perdió el rol', async () => {
    sinon.stub(userRolDb, 'deleteUserRol').resolves({ id: 300, id_rol: 5, id_user: 90, cliente_id: 40 });
    const sync = sinon.stub(tipoDb, 'sincronizarTipo').resolves('EMP');
    const res = await request(app).delete('/api/userrol/300/40').set(auth());
    expect(res.status).to.equal(200);
    expect(sync.calledOnceWithExactly(90, 40)).to.equal(true);
  });

  it('DELETE inexistente → 404 (antes reventaba con "res is not defined")', async () => {
    sinon.stub(userRolDb, 'deleteUserRol').resolves(undefined);
    const res = await request(app).delete('/api/userrol/300/40').set(auth());
    expect(res.status).to.equal(404);
  });

  it('PUT cambia el rol y recalcula el tipo', async () => {
    sinon.stub(userRolDb, 'rolDelTenant').resolves({ id: 6 });
    sinon.stub(userRolDb, 'updateUserRol').resolves({ id: 300, id_rol: 6, id_user: 90, cliente_id: 40 });
    const sync = sinon.stub(tipoDb, 'sincronizarTipo').resolves('TUT');
    const res = await request(app).put('/api/userrol/300').set(auth()).send({ id_rol: 6 });
    expect(res.status).to.equal(200);
    expect(sync.calledOnceWithExactly(90, 40)).to.equal(true);
  });

  it('un externo no puede asignarse roles (deny-by-default)', async () => {
    const crear = sinon.stub(userRolDb, 'createUserRol');
    const res = await request(app).post('/api/userrol').set(auth({ role: ['profesor'], tipo: 'PROF' }))
      .send({ id_rol: 1, id_user: 7 });
    expect(res.status).to.equal(403);
    expect(crear.called).to.equal(false);
  });
});
