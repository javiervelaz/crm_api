// tests/cuit.test.js — CUIT diferido: opcional en el alta, obligatorio antes del primer pedido.
const sinon = require('sinon');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-tests';
const cuitDb = require('../model/cliente/cuit');
const { requireCuit } = require('../middleware/cuitMiddleware');
const cuitService = require('../services/cliente/cuitService');

const CUIT_OK = '30712345671';

const resMock = () => {
  const r = { statusCode: 200, body: null };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
};

describe('CUIT diferido', () => {
  let expect;
  before(async () => { ({ expect } = await import('chai')); });
  beforeEach(() => sinon.restore());
  afterEach(() => sinon.restore());

  describe('requireCuit', () => {
    it('deja pasar si el comercio tiene CUIT', async () => {
      sinon.stub(cuitDb, 'getCuit').resolves(CUIT_OK);
      const next = sinon.spy();
      await requireCuit({ user: { cliente_id: 5 } }, resMock(), next);
      expect(next.calledOnce).to.equal(true);
    });

    it('bloquea con 403 CUIT_REQUERIDO si no lo cargó', async () => {
      sinon.stub(cuitDb, 'getCuit').resolves(null);
      const next = sinon.spy();
      const res = resMock();
      await requireCuit({ user: { cliente_id: 5 } }, res, next);
      expect(next.called).to.equal(false);
      expect(res.statusCode).to.equal(403);
      expect(res.body.code).to.equal('CUIT_REQUERIDO');
    });

    it('403 si el usuario no tiene cliente', async () => {
      const res = resMock();
      await requireCuit({ user: {} }, res, sinon.spy());
      expect(res.statusCode).to.equal(403);
    });
  });

  describe('cuitService.cargar', () => {
    it('rechaza un CUIT con dígito verificador inválido', async () => {
      let err;
      try { await cuitService.cargar(5, '11111111111'); } catch (e) { err = e; }
      expect(err.status).to.equal(400);
      expect(err.code).to.equal('CUIT_INVALIDO');
    });

    it('guarda un CUIT válido', async () => {
      sinon.stub(cuitDb, 'getCuit').resolves(null);
      sinon.stub(cuitDb, 'cuitTomado').resolves(false);
      const set = sinon.stub(cuitDb, 'setCuitSiVacio').resolves(true);
      const r = await cuitService.cargar(5, '30-71234567-1');
      expect(r.cuitCargado).to.equal(true);
      expect(set.calledWith(5, CUIT_OK)).to.equal(true);
    });

    it('409 si el comercio ya tenía CUIT', async () => {
      sinon.stub(cuitDb, 'getCuit').resolves(CUIT_OK);
      let err;
      try { await cuitService.cargar(5, CUIT_OK); } catch (e) { err = e; }
      expect(err.status).to.equal(409);
      expect(err.code).to.equal('CUIT_YA_CARGADO');
    });

    it('409 si el CUIT es de otro comercio', async () => {
      sinon.stub(cuitDb, 'getCuit').resolves(null);
      sinon.stub(cuitDb, 'cuitTomado').resolves(true);
      let err;
      try { await cuitService.cargar(5, CUIT_OK); } catch (e) { err = e; }
      expect(err.status).to.equal(409);
      expect(err.code).to.equal('CUIT_TAKEN');
    });
  });
});
