/**
 * security.tanda1.test.js
 *
 * Tanda 1 — permisos, roles y usuarios (guards de backend):
 *   bug 17: no auto-eliminación / no eliminar al último admin
 *   bug 15 (ROL-06): un admin no puede quitarse los módulos de administración
 *
 * (bug 21 dashboard, bug 14 crear rol UI, bug 13 volver, bug 7 alta->editar
 *  son de frontend y se verifican por build/lint + smoke manual.)
 */

const request = require('supertest');
const sinon = require('sinon');
const jwt = require('jsonwebtoken');

const app = require('../node');
const userService = require('../services/user/userService');
const rolService = require('../services/rol/rolService');
const pool = require('../pool');

let chai, expect;

function makeAdminToken(overrides = {}) {
  return jwt.sign(
    {
      userId: 5,
      cliente_id: 1,
      username: 'admin',
      sucursal: 1,
      role: ['admin'],
      modules: ['usuarios', 'roles'],
      permissions: {
        usuarios: ['usuarios.list', 'usuarios.create', 'usuarios.update', 'usuarios.delete'],
        roles: ['roles.list', 'roles.create', 'roles.update', 'roles.delete'],
      },
      ...overrides,
    },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

describe('Tanda 1 — bug 17: guardas de eliminación de usuario', () => {
  before(async () => { chai = await import('chai'); expect = chai.expect; });
  afterEach(() => sinon.restore());

  it('DELETE del propio usuario → 400 SELF_DELETE', async () => {
    const res = await request(app)
      .delete('/api/users/5/1') // id 5 == userId del token
      .set('Authorization', `Bearer ${makeAdminToken({ userId: 5 })}`);
    expect(res.status).to.equal(400);
    expect(res.body).to.have.property('code', 'SELF_DELETE');
  });

  it('DELETE del último admin → 400 LAST_ADMIN', async () => {
    sinon.stub(userService, 'isAdminService').resolves(true);
    sinon.stub(userService, 'countAdminsService').resolves(1);
    const res = await request(app)
      .delete('/api/users/6/1') // otro usuario, admin, único
      .set('Authorization', `Bearer ${makeAdminToken({ userId: 5 })}`);
    expect(res.status).to.equal(400);
    expect(res.body).to.have.property('code', 'LAST_ADMIN');
  });

  it('DELETE de un no-admin → NO 400 (procede)', async () => {
    sinon.stub(userService, 'isAdminService').resolves(false);
    sinon.stub(userService, 'deleteUserService').resolves({ id: 6 });
    const res = await request(app)
      .delete('/api/users/6/1')
      .set('Authorization', `Bearer ${makeAdminToken({ userId: 5 })}`);
    expect(res.status).to.equal(200);
  });

  it('DELETE de otro admin cuando hay más de uno → procede', async () => {
    sinon.stub(userService, 'isAdminService').resolves(true);
    sinon.stub(userService, 'countAdminsService').resolves(3);
    sinon.stub(userService, 'deleteUserService').resolves({ id: 6 });
    const res = await request(app)
      .delete('/api/users/6/1')
      .set('Authorization', `Bearer ${makeAdminToken({ userId: 5 })}`);
    expect(res.status).to.equal(200);
  });
});

describe('Tanda 1 — bug 15 (ROL-06): auto-bloqueo por permisos de rol', () => {
  before(async () => { if (!chai) { chai = await import('chai'); expect = chai.expect; } });
  afterEach(() => sinon.restore());

  it('quitar usuarios/roles del propio rol → 400 SELF_LOCKOUT', async () => {
    const q = sinon.stub(pool, 'query');
    // 1) ¿el usuario tiene este rol? -> sí
    q.onCall(0).resolves({ rowCount: 1, rows: [{ '?column?': 1 }] });
    // 2) módulos críticos usuarios/roles -> ids 10 y 11
    q.onCall(1).resolves({ rows: [{ id: 10, codigo: 'usuarios' }, { id: 11, codigo: 'roles' }] });

    // payload que NO incluye 10 ni 11 -> se autobloquearía
    const payload = [{ modulo_id: 99, permisos: [] }];
    const res = await request(app)
      .post('/api/rol/7/1/modulos-permisos')
      .set('Authorization', `Bearer ${makeAdminToken({ userId: 5 })}`)
      .send(payload);
    expect(res.status).to.equal(400);
    expect(res.body).to.have.property('code', 'SELF_LOCKOUT');
  });

  it('editar un rol que NO es del usuario → no aplica el guard (no 400 SELF_LOCKOUT)', async () => {
    const q = sinon.stub(pool, 'query');
    // 1) ¿el usuario tiene este rol? -> no
    q.onCall(0).resolves({ rowCount: 0, rows: [] });
    // el resto de las queries (BEGIN/DELETE/INSERT/COMMIT) van por pool.connect(),
    // que sin DB fallará -> el test sólo verifica que NO sea 400 SELF_LOCKOUT.
    const payload = [{ modulo_id: 99, permisos: [] }];
    const res = await request(app)
      .post('/api/rol/8/1/modulos-permisos')
      .set('Authorization', `Bearer ${makeAdminToken({ userId: 5 })}`)
      .send(payload);
    expect(res.body).to.not.have.property('code', 'SELF_LOCKOUT');
  });
});


describe('Tanda 1 — deleteRol: no eliminar un rol en uso', () => {
  before(async () => { if (!chai) { chai = await import('chai'); expect = chai.expect; } });
  afterEach(() => sinon.restore());

  it('DELETE de un rol asignado a usuarios → 400 ROLE_IN_USE', async () => {
    sinon.stub(rolService, 'countUsersWithRoleService').resolves(2);
    const res = await request(app)
      .delete('/api/rol/7/1')
      .set('Authorization', `Bearer ${makeAdminToken({ userId: 5 })}`);
    expect(res.status).to.equal(400);
    expect(res.body).to.have.property('code', 'ROLE_IN_USE');
  });

  it('DELETE de un rol sin usuarios → procede', async () => {
    sinon.stub(rolService, 'countUsersWithRoleService').resolves(0);
    sinon.stub(rolService, 'deleteRolService').resolves({ id: 7 });
    const res = await request(app)
      .delete('/api/rol/7/1')
      .set('Authorization', `Bearer ${makeAdminToken({ userId: 5 })}`);
    expect(res.status).to.equal(200);
  });
});
