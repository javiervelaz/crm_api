/**
 * security.tanda0.test.js
 *
 * Tanda 0 — fixes críticos de seguridad:
 *   bug 41: aislamiento multi-tenant en capa de aplicación (403 cross-tenant)
 *   bug 25: validación de params numéricos (400 antes de la DB, sin fuga SQL)
 *   bug 24: el perfil nunca devuelve el hash de la contraseña; update no re-hashea
 */

const request = require('supertest');
const sinon = require('sinon');
const jwt = require('jsonwebtoken');

const app = require('../node');
const productoService = require('../services/producto/productoService');
const profileService = require('../services/profile/profileService');
const profileDb = require('../model/profile/db');

let chai, expect;

function makeToken(overrides = {}) {
  return jwt.sign(
    {
      userId: 'u-1',
      cliente_id: 1,
      username: 'test',
      sucursal: 1,
      role: ['admin'],
      modules: ['productos', 'usuarios'],
      permissions: {
        productos: ['productos.list', 'productos.create', 'productos.update', 'productos.delete'],
        usuarios: ['usuarios.list'],
      },
      ...overrides,
    },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

describe('Tanda 0 — bug 41: aislamiento multi-tenant (path param)', () => {
  before(async () => { chai = await import('chai'); expect = chai.expect; });
  afterEach(() => sinon.restore());

  it('GET /api/producto/list/2 con token de cliente 1 → 403 TENANT_MISMATCH', async () => {
    const res = await request(app)
      .get('/api/producto/list/2')
      .set('Authorization', `Bearer ${makeToken({ cliente_id: 1 })}`);
    expect(res.status).to.equal(403);
    expect(res.body).to.have.property('code', 'TENANT_MISMATCH');
  });

  it('GET /api/producto/list/1 con token de cliente 1 → NO 403 (mismo tenant)', async () => {
    sinon.stub(productoService, 'getProductoListService').resolves([{ id: 1, nombre: 'x' }]);
    const res = await request(app)
      .get('/api/producto/list/1')
      .set('Authorization', `Bearer ${makeToken({ cliente_id: 1 })}`);
    expect(res.status).to.not.equal(403);
  });

  it('GET /api/users/list/999 con token de cliente 1 → 403 (no fuga, 403 explícito)', async () => {
    const res = await request(app)
      .get('/api/users/list/999')
      .set('Authorization', `Bearer ${makeToken({ cliente_id: 1 })}`);
    expect(res.status).to.equal(403);
    expect(res.body).to.have.property('code', 'TENANT_MISMATCH');
  });
});

describe('Tanda 0 — bug 25: params numéricos (400 antes de la DB)', () => {
  before(async () => { if (!chai) { chai = await import('chai'); expect = chai.expect; } });

  it('GET /api/producto/abc/1 (:id no numérico) → 400 INVALID_PARAM, sin error SQL', async () => {
    const res = await request(app)
      .get('/api/producto/abc/1')
      .set('Authorization', `Bearer ${makeToken({ cliente_id: 1 })}`);
    expect(res.status).to.equal(400);
    expect(res.body).to.have.property('code', 'INVALID_PARAM');
    expect(JSON.stringify(res.body)).to.not.match(/invalid input syntax|syntax error|pg|postgres/i);
  });

  it('GET /api/producto/list/abc (:cliente_id no numérico) → 400 INVALID_PARAM', async () => {
    const res = await request(app)
      .get('/api/producto/list/abc')
      .set('Authorization', `Bearer ${makeToken({ cliente_id: 1 })}`);
    expect(res.status).to.equal(400);
    expect(res.body).to.have.property('code', 'INVALID_PARAM');
  });
});

describe('Tanda 0 — bug 24: el perfil no expone el hash de la contraseña', () => {
  before(async () => { if (!chai) { chai = await import('chai'); expect = chai.expect; } });
  afterEach(() => sinon.restore());

  it('getProfileByUserIdService quita el campo password del resultado', async () => {
    sinon.stub(profileDb, 'getProfileByUserId').resolves({
      id: 10, id_user: 5, dni: '30123456', telefono: '351', password: '$2b$12$hashsupersecreto', cliente_id: 1,
    });
    const result = await profileService.getProfileByUserIdService(5, 1);
    expect(result).to.not.have.property('password');
    expect(result).to.have.property('dni', '30123456');
  });

  it('getProfileListService quita password de cada fila', async () => {
    sinon.stub(profileDb, 'getProfiles').resolves([
      { id: 1, password: '$2b$12$a', dni: '1' },
      { id: 2, password: '$2b$12$b', dni: '2' },
    ]);
    const result = await profileService.getProfileListService(1);
    expect(result).to.be.an('array').with.length(2);
    result.forEach((r) => expect(r).to.not.have.property('password'));
  });

  it('updateProfileService con password vacío → NO toca la contraseña (pasa null al modelo)', async () => {
    const stub = sinon.stub(profileDb, 'updateProfile').resolves({ id: 3, dni: '9' });
    await profileService.updateProfileService(3, { dni: '9', telefono: '1', password: '', cliente_id: 1 });
    expect(stub.calledOnce).to.equal(true);
    expect(stub.firstCall.args[1]).to.have.property('password', null);
  });

  it('updateProfileService no re-hashea un hash reenviado (password que ya parece bcrypt → null)', async () => {
    const stub = sinon.stub(profileDb, 'updateProfile').resolves({ id: 3 });
    await profileService.updateProfileService(3, { password: '$2b$12$yaEsUnHash', cliente_id: 1 });
    expect(stub.firstCall.args[1]).to.have.property('password', null);
  });

  it('updateProfileService con password nuevo → lo guarda hasheado (no en texto plano)', async () => {
    const stub = sinon.stub(profileDb, 'updateProfile').resolves({ id: 3 });
    await profileService.updateProfileService(3, { password: 'MiClaveNueva2026', cliente_id: 1 });
    const saved = stub.firstCall.args[1].password;
    expect(saved).to.be.a('string');
    expect(saved).to.not.equal('MiClaveNueva2026');
    expect(saved).to.match(/^\$2[aby]\$/);
  });
});
