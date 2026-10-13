// tests/legajo.test.js
// Legajo autonumérico por tenant (migrations/014_legajo_autonumerico.sql).
const request = require('supertest');
const sinon = require('sinon');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-tests';
const app = require('../node');
const profileDb = require('../model/profile/db');
const legajoDb = require('../model/profile/legajo');
const userRolDb = require('../model/user_rol/db');

let expect;
before(async () => { ({ expect } = await import('chai')); });
afterEach(() => sinon.restore());

const token = (over = {}) => jwt.sign({
  userId: 7, cliente_id: 40, username: 'x', role: ['admin'], modules: ['usuarios'],
  permissions: {}, tipo: 'ADMIN', debeCambiarPassword: false, ...over,
}, process.env.JWT_SECRET, { expiresIn: '1h' });
const auth = (over) => ({ Authorization: `Bearer ${token(over)}` });

const alta = { id_user: 90, dni: 30111222, telefono: '3515551234', password: 'Clave12345A', fecha_ingreso: '2026-10-13' };

describe('Legajo autonumérico', () => {
  it('GET /api/profile/legajo/proximo devuelve el próximo legajo del tenant del JWT', async () => {
    const prox = sinon.stub(legajoDb, 'proximoLegajo').resolves('12');
    const res = await request(app).get('/api/profile/legajo/proximo').set(auth());
    expect(res.status).to.equal(200);
    expect(res.body).to.deep.equal({ legajo: '12' });
    expect(prox.calledOnceWithExactly(40)).to.equal(true);
  });

  it('POST /api/profile asigna el legajo e ignora el del body', async () => {
    sinon.stub(userRolDb, 'userDelTenant').resolves({ id: 90 });
    const sig = sinon.stub(legajoDb, 'siguienteLegajo').resolves('12');
    const crear = sinon.stub(profileDb, 'createProfile').callsFake(async (p) => ({ id: 1, ...p }));

    const res = await request(app).post('/api/profile').set(auth()).send({ ...alta, legajo: '999' });

    expect(res.status).to.equal(201);
    expect(sig.calledOnceWithExactly(40)).to.equal(true);
    expect(crear.firstCall.args[0]).to.include({ legajo: '12', cliente_id: 40 });
    expect(res.body).to.not.have.property('password');
  });

  it('POST /api/profile sin legajo en el body funciona (ya no es obligatorio)', async () => {
    sinon.stub(userRolDb, 'userDelTenant').resolves({ id: 90 });
    sinon.stub(legajoDb, 'siguienteLegajo').resolves('13');
    sinon.stub(profileDb, 'createProfile').callsFake(async (p) => ({ id: 2, ...p }));
    const res = await request(app).post('/api/profile').set(auth()).send(alta);
    expect(res.status).to.equal(201);
    expect(res.body.legajo).to.equal('13');
  });

  it('POST /api/profile para un usuario de otro tenant → 404 y no consume legajo', async () => {
    sinon.stub(userRolDb, 'userDelTenant').resolves(null);
    const sig = sinon.stub(legajoDb, 'siguienteLegajo');
    const res = await request(app).post('/api/profile').set(auth()).send(alta);
    expect(res.status).to.equal(404);
    expect(sig.called).to.equal(false);
  });

  it('PUT /api/profile/:id no modifica el legajo y usa el tenant del JWT', async () => {
    const upd = sinon.stub(profileDb, 'updateProfile').callsFake(async (id, p) => ({ id, ...p }));
    const res = await request(app).put('/api/profile/5').set(auth()).send({ telefono: '351', legajo: '999' });
    expect(res.status).to.equal(200);
    const datos = upd.firstCall.args[1];
    expect(datos).to.not.have.property('legajo');
    expect(datos.cliente_id).to.equal(40);
  });
});
