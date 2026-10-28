/**
 * reportesAuthz.test.js — /api/reportes exige módulo + permiso reportes.list,
 * no solo login + feature de plan.
 */
const request = require('supertest');
const sinon = require('sinon');
const jwt = require('jsonwebtoken');

const app = require('../node');
const planService = require('../services/cliente/planService');
const reportesDb = require('../model/reportes/db');

let expect;
before(async () => { ({ expect } = await import('chai')); });
afterEach(() => sinon.restore());

const token = ({ modules = [], permissions = {} } = {}) => jwt.sign(
  { userId: 5, cliente_id: 7, roles: ['x'], modules, permissions },
  process.env.JWT_SECRET, { expiresIn: '1h' },
);

const RUTAS = [
  ['post', '/api/reportes/ventas'],
  ['post', '/api/reportes/gastos/tipo-categoria-filter'],
  ['post', '/api/reportes/gastos/categoria-salida-filter'],
  ['get', '/api/reportes/salida/categoria-salida/7'],
  ['get', '/api/reportes/salida/categoria-tipo'],
  ['post', '/api/reportes/clientes'],
];

describe('/api/reportes — autorización de módulo y permiso', () => {
  beforeEach(() => {
    sinon.stub(planService, 'getClienteTierAndFeatures').resolves({
      clienteId: 7, tierCode: 'PREMIUM', features: { canUseReports: true }, isExpired: false,
    });
    for (const fn of Object.keys(reportesDb)) {
      if (typeof reportesDb[fn] === 'function') sinon.stub(reportesDb, fn).resolves([]);
    }
  });

  for (const [metodo, ruta] of RUTAS) {
    it(`${metodo.toUpperCase()} ${ruta}: sin módulo reportes → 403`, async () => {
      const r = await request(app)[metodo](ruta).set('Authorization', `Bearer ${token({ modules: ['operaciones'] })}`).send({});
      expect(r.status).to.equal(403);
    });

    it(`${metodo.toUpperCase()} ${ruta}: con módulo pero sin reportes.list → 403`, async () => {
      const r = await request(app)[metodo](ruta)
        .set('Authorization', `Bearer ${token({ modules: ['reportes'], permissions: { reportes: ['reportes.create'] } })}`).send({});
      expect(r.status).to.equal(403);
    });

    it(`${metodo.toUpperCase()} ${ruta}: con módulo y reportes.list → no 403`, async () => {
      const r = await request(app)[metodo](ruta)
        .set('Authorization', `Bearer ${token({ modules: ['reportes'], permissions: { reportes: ['reportes.list'] } })}`).send({});
      expect(r.status).to.not.equal(403);
    });
  }

  it('sin la feature del plan sigue dando 403 (el plan manda antes que el rol)', async () => {
    planService.getClienteTierAndFeatures.resolves({ clienteId: 7, tierCode: 'FREE', features: { canUseReports: false }, isExpired: false });
    const r = await request(app).post('/api/reportes/ventas')
      .set('Authorization', `Bearer ${token({ modules: ['reportes'], permissions: { reportes: ['reportes.list'] } })}`).send({});
    expect(r.status).to.equal(403);
    expect(r.body.code).to.equal('PLAN_INACTIVE');
  });
});
