// tests/usuariosSoloStaff.test.js
// Usuarios y Roles gestionan sólo al staff: profesores, tutores y alumnos se
// manejan desde Academia (/api/edu). Ver model/users/tipo.js (TIPOS_EXTERNOS).
const request = require('supertest');
const sinon = require('sinon');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-tests';
const app = require('../node');
const pool = require('../pool');
const userDb = require('../model/users/db');
const userRolDb = require('../model/user_rol/db');
const rolDb = require('../model/roles/db');
const tipoDb = require('../model/users/tipo');
const userService = require('../services/user/userService');

let expect;
before(async () => { ({ expect } = await import('chai')); });
afterEach(() => sinon.restore());

const token = (over = {}) => jwt.sign({
  userId: 7, cliente_id: 40, username: 'x', role: ['admin'], modules: ['usuarios', 'roles'],
  permissions: { usuarios: ['usuarios.create', 'usuarios.update', 'usuarios.list', 'usuarios.delete'] },
  tipo: 'ADMIN', debeCambiarPassword: false, ...over,
}, process.env.JWT_SECRET, { expiresIn: '1h' });
const auth = (over) => ({ Authorization: `Bearer ${token(over)}` });

describe('Usuarios sólo staff: asignación de roles', () => {
  let crear;
  let sync;
  beforeEach(() => {
    sinon.stub(userRolDb, 'rolDelTenant').resolves({ id: 5 });
    sinon.stub(userRolDb, 'userDelTenant').resolves({ id: 90 });
    sinon.stub(userRolDb, 'userRolExistente').resolves(null);
    crear = sinon.stub(userRolDb, 'createUserRol').callsFake(async (r) => ({ id: 300, ...r }));
    sync = sinon.stub(tipoDb, 'sincronizarTipo').resolves('EMP');
  });

  it('asignar el rol profesor/tutor/alumno → 400 ROL_EXTERNO, sin insertar', async () => {
    sinon.stub(tipoDb, 'rolEsExterno').resolves(true);
    sinon.stub(tipoDb, 'userEsExterno').resolves(false);
    const res = await request(app).post('/api/userrol').set(auth()).send({ id_rol: 5, id_user: 90 });
    expect(res.status).to.equal(400);
    expect(res.body.code).to.equal('ROL_EXTERNO');
    expect(res.body.error).to.equal('Los roles de profesor, tutor y alumno se asignan desde Academia');
    expect(crear.called).to.equal(false);
    expect(sync.called).to.equal(false);
  });

  it('darle un rol de staff (ej. admin) a un profesor → 400 USUARIO_EXTERNO (cierra la escalada)', async () => {
    sinon.stub(tipoDb, 'rolEsExterno').resolves(false);
    sinon.stub(tipoDb, 'userEsExterno').withArgs(90, 40).resolves(true);
    const res = await request(app).post('/api/userrol').set(auth()).send({ id_rol: 1, id_user: 90 });
    expect(res.status).to.equal(400);
    expect(res.body.code).to.equal('USUARIO_EXTERNO');
    expect(crear.called).to.equal(false);
  });

  it('un empleado (no admin) no puede asignar roles → 403', async () => {
    const res = await request(app).post('/api/userrol')
      .set(auth({ role: ['empleado'], tipo: 'EMP', userId: 8 })).send({ id_rol: 1, id_user: 8 });
    expect(res.status).to.equal(403);
    expect(crear.called).to.equal(false);
  });

  it('quitar el rol externo → 400 ROL_EXTERNO, sin borrar', async () => {
    sinon.stub(userRolDb, 'getUserRolById').resolves({ id: 300, id_rol: 5, id_user: 90, cliente_id: 40 });
    sinon.stub(tipoDb, 'rolEsExterno').withArgs(5, 40).resolves(true);
    const borrar = sinon.stub(userRolDb, 'deleteUserRol');
    const res = await request(app).delete('/api/userrol/300/40').set(auth());
    expect(res.status).to.equal(400);
    expect(res.body.code).to.equal('ROL_EXTERNO');
    expect(borrar.called).to.equal(false);
  });

  it('quitar un rol de staff mal asignado a un externo sí se puede (limpieza)', async () => {
    sinon.stub(userRolDb, 'getUserRolById').resolves({ id: 301, id_rol: 1, id_user: 90, cliente_id: 40 });
    sinon.stub(tipoDb, 'rolEsExterno').resolves(false);
    sinon.stub(userRolDb, 'deleteUserRol').resolves({ id: 301, id_rol: 1, id_user: 90, cliente_id: 40 });
    sync.resolves('PROF');
    const res = await request(app).delete('/api/userrol/301/40').set(auth());
    expect(res.status).to.equal(200);
    expect(sync.calledOnceWithExactly(90, 40)).to.equal(true);
  });

  it('cambiar un rol externo por otro → 400 ROL_EXTERNO, sin actualizar', async () => {
    sinon.stub(userRolDb, 'getUserRolById').resolves({ id: 300, id_rol: 5, id_user: 90, cliente_id: 40 });
    sinon.stub(tipoDb, 'rolEsExterno').withArgs(5, 40).resolves(true);
    const upd = sinon.stub(userRolDb, 'updateUserRol');
    const res = await request(app).put('/api/userrol/300').set(auth()).send({ id_rol: 6 });
    expect(res.status).to.equal(400);
    expect(res.body.code).to.equal('ROL_EXTERNO');
    expect(upd.called).to.equal(false);
  });
});

describe('Usuarios sólo staff: usuarios', () => {
  it('la lista excluye profesores, tutores y alumnos', async () => {
    const q = sinon.stub(pool, 'query').resolves({ rows: [] });
    await userDb.getUsers(40);
    const [sql, params] = q.firstCall.args;
    expect(sql).to.match(/ut\.codigo IS NULL OR ut\.codigo <> ALL\(\$2::text\[\]\)/);
    expect(params).to.deep.equal([40, ['PROF', 'TUT', 'ALU']]);
  });

  it('editar un usuario de la academia → 400 USUARIO_EXTERNO, sin actualizar', async () => {
    sinon.stub(tipoDb, 'userEsExterno').withArgs('90', 40).resolves(true);
    const upd = sinon.stub(userDb, 'updateUser');
    const res = await request(app).put('/api/users/90').set(auth())
      .send({ nombre: 'Pedro', apellido: 'Ruiz', email: 'pedro@ejemplo.com' });
    expect(res.status).to.equal(400);
    expect(res.body.code).to.equal('USUARIO_EXTERNO');
    expect(upd.called).to.equal(false);
  });

  it('borrar un usuario de la academia → 400 USUARIO_EXTERNO, sin borrar', async () => {
    sinon.stub(userService, 'isAdminService').resolves(false);
    sinon.stub(tipoDb, 'userEsExterno').resolves(true);
    const del = sinon.stub(userDb, 'deleteUser');
    const res = await request(app).delete('/api/users/90/40').set(auth());
    expect(res.status).to.equal(400);
    expect(res.body.code).to.equal('USUARIO_EXTERNO');
    expect(del.called).to.equal(false);
  });

  it('borrar un usuario inexistente → 404 (antes "res is not defined" → 500)', async () => {
    sinon.stub(userService, 'isAdminService').resolves(false);
    sinon.stub(tipoDb, 'userEsExterno').resolves(false);
    sinon.stub(userDb, 'deleteUser').resolves(undefined);
    const res = await request(app).delete('/api/users/90/40').set(auth());
    expect(res.status).to.equal(404);
  });

  it('datos faltantes al editar → 400 (antes 500)', async () => {
    const res = await request(app).put('/api/users/90').set(auth()).send({ nombre: 'Sin email' });
    expect(res.status).to.equal(400);
  });
});

describe('Usuarios sólo staff: roles del sistema', () => {
  it('la lista marca los roles externos', async () => {
    const q = sinon.stub(pool, 'query').resolves({ rows: [{ id: 5, descripcion: 'tutor', externo: true }] });
    const res = await request(app).get('/api/rol/list/40').set(auth());
    expect(res.status).to.equal(200);
    expect(res.body[0].externo).to.equal(true);
    expect(q.firstCall.args[1]).to.deep.equal(['40', ['PROF', 'TUT', 'ALU']]);
  });

  it('renombrar, borrar o cambiar permisos de un rol externo → 400 ROL_EXTERNO', async () => {
    sinon.stub(tipoDb, 'rolEsExterno').resolves(true);
    sinon.stub(rolDb, 'countUsersWithRole').resolves(0);
    const upd = sinon.stub(rolDb, 'updateRol');
    const del = sinon.stub(rolDb, 'deleteRol');
    const r1 = await request(app).put('/api/rol/5').set(auth()).send({ descripcion: 'Docente' });
    const r2 = await request(app).delete('/api/rol/5/40').set(auth());
    const r3 = await request(app).post('/api/rol/5/40/modulos-permisos').set(auth()).send([]);
    for (const r of [r1, r2, r3]) {
      expect(r.status).to.equal(400);
      expect(r.body.code).to.equal('ROL_EXTERNO');
    }
    expect(upd.called).to.equal(false);
    expect(del.called).to.equal(false);
  });

  it('crear un rol con nombre de tipo externo ("Profesor") → 400 ROL_EXTERNO', async () => {
    sinon.stub(tipoDb, 'nombreDeTipoExterno').withArgs('Profesor').resolves(true);
    const crear = sinon.stub(rolDb, 'createRol');
    const res = await request(app).post('/api/rol').set(auth()).send({ descripcion: 'Profesor' });
    expect(res.status).to.equal(400);
    expect(res.body.code).to.equal('ROL_EXTERNO');
    expect(crear.called).to.equal(false);
  });

  it('un rol de staff se sigue pudiendo renombrar', async () => {
    sinon.stub(tipoDb, 'rolEsExterno').resolves(false);
    sinon.stub(tipoDb, 'nombreDeTipoExterno').resolves(false);
    sinon.stub(rolDb, 'updateRol').resolves({ id: 6, descripcion: 'Encargado' });
    const res = await request(app).put('/api/rol/6').set(auth()).send({ descripcion: 'Encargado' });
    expect(res.status).to.equal(200);
  });
});

describe('Usuarios sólo staff: SQL de tipo', () => {
  it('rolEsExterno resuelve el tipo por user_type_id o por nombre', async () => {
    const q = sinon.stub(pool, 'query').resolves({ rows: [{ codigo: 'TUT' }] });
    expect(await tipoDb.rolEsExterno(5, 40)).to.equal(true);
    expect(q.firstCall.args[0]).to.match(/user_type_id IS NULL AND lower\(descripcion\) = lower\(trim\(r\.descripcion\)\)/);
    q.resolves({ rows: [{ codigo: 'EMP' }] });
    expect(await tipoDb.rolEsExterno(6, 40)).to.equal(false);
    q.resolves({ rows: [] });
    expect(await tipoDb.rolEsExterno(7, 40)).to.equal(false);
  });

  it('userEsExterno: tipo externo o algún rol externo', async () => {
    const q = sinon.stub(pool, 'query').resolves({ rows: [{ externo: true }] });
    expect(await tipoDb.userEsExterno(90, 40)).to.equal(true);
    expect(q.firstCall.args[1]).to.deep.equal([90, 40, ['PROF', 'TUT', 'ALU']]);
    q.resolves({ rows: [{ externo: false }] });
    expect(await tipoDb.userEsExterno(91, 40)).to.equal(false);
  });
});
