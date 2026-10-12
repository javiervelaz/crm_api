// tests/gastosSinCaja.test.js
// CP-20: tenants sin módulo 'operaciones' (rubro educación) cargan gastos sin caja.
const request = require('supertest');
const sinon = require('sinon');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-tests';
const app = require('../node');
const db = require('../model/salida_caja/db');
const service = require('../services/salidaCaja/salidaCajaService');

let expect;
before(async () => { ({ expect } = await import('chai')); });
afterEach(() => sinon.restore());

const GASTO = { categoria_salida_id: 1, descripcion: 'Alquiler', monto: 150000, usuario_id: 7, cliente_id: 40 };

describe('createSalidaCajaService según el tenant use caja o no', () => {
  it('tenant sin operaciones: guarda sin registro diario aunque se mande uno', async () => {
    sinon.stub(db, 'tenantUsaCaja').resolves(false);
    const create = sinon.stub(db, 'createSalidaCaja').callsFake(async (x) => ({ id: 1, ...x }));

    await service.createSalidaCajaService([{ ...GASTO, registro_diario_id: 99 }, { ...GASTO, descripcion: 'Luz' }]);

    expect(create.callCount).to.equal(2);
    expect(create.firstCall.args[0].registro_diario_id).to.equal(null);
    expect(create.secondCall.args[0].registro_diario_id).to.equal(null);
  });

  it('tenant con operaciones: sin caja abierta rechaza y no inserta nada', async () => {
    sinon.stub(db, 'tenantUsaCaja').resolves(true);
    const create = sinon.stub(db, 'createSalidaCaja');

    let err;
    try { await service.createSalidaCajaService([GASTO]); } catch (e) { err = e; }

    expect(err.message).to.match(/caja abierta/);
    expect(create.called).to.equal(false);
  });

  it('tenant con operaciones: con caja guarda el registro diario (gastronomía igual que hoy)', async () => {
    sinon.stub(db, 'tenantUsaCaja').resolves(true);
    const create = sinon.stub(db, 'createSalidaCaja').callsFake(async (x) => ({ id: 1, ...x }));

    await service.createSalidaCajaService([{ ...GASTO, registro_diario_id: 12 }]);
    expect(create.firstCall.args[0].registro_diario_id).to.equal(12);
  });

  it('valida todo el lote antes de insertar: un ítem inválido no deja los anteriores guardados', async () => {
    sinon.stub(db, 'tenantUsaCaja').resolves(false);
    const create = sinon.stub(db, 'createSalidaCaja');

    let err;
    try { await service.createSalidaCajaService([GASTO, { ...GASTO, descripcion: '' }]); } catch (e) { err = e; }

    expect(err).to.be.instanceOf(Error);
    expect(create.called).to.equal(false);
  });

  it('rechaza montos cero o negativos', async () => {
    sinon.stub(db, 'tenantUsaCaja').resolves(false);
    sinon.stub(db, 'createSalidaCaja');

    for (const monto of [-10, '0', 'abc']) {
      let err;
      try { await service.createSalidaCajaService([{ ...GASTO, monto }]); } catch (e) { err = e; }
      expect(err, String(monto)).to.be.instanceOf(Error);
    }
  });

  it('array vacío o sin cliente → error', async () => {
    let e1; try { await service.createSalidaCajaService([]); } catch (e) { e1 = e; }
    let e2; try { await service.createSalidaCajaService([{ ...GASTO, cliente_id: undefined }]); } catch (e) { e2 = e; }
    expect(e1).to.be.instanceOf(Error);
    expect(e2.message).to.match(/cliente_id/);
  });
});

describe('getGastosPorPeriodoService', () => {
  it('pasa el rango a la query', async () => {
    const q = sinon.stub(db, 'getSalidasCajasPorPeriodo').resolves([{ id: 1 }]);
    const r = await service.getGastosPorPeriodoService(40, '2026-10-01', '2026-10-31');
    expect(r).to.have.length(1);
    expect(q.firstCall.args).to.deep.equal([40, '2026-10-01', '2026-10-31']);
  });

  it('rechaza formatos, fechas inexistentes, rangos invertidos y de más de un año', async () => {
    sinon.stub(db, 'getSalidasCajasPorPeriodo').resolves([]);
    for (const [d, h] of [
      ['01/10/2026', '2026-10-31'],
      ['2026-02-30', '2026-03-01'],
      ['2026-10-31', '2026-10-01'],
      ['2025-01-01', '2026-06-01'],
      [undefined, '2026-10-01'],
    ]) {
      let err;
      try { await service.getGastosPorPeriodoService(40, d, h); } catch (e) { err = e; }
      expect(err?.status, `${d}..${h}`).to.equal(400);
    }
  });
});

describe('Endpoints /api/salida-caja', () => {
  const token = jwt.sign(
    { userId: 7, cliente_id: 40, username: 'ana', role: ['admin'], modules: ['gasto', 'flujo'], permissions: {} },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
  const auth = { Authorization: `Bearer ${token}` };

  it('GET /config sin token → 401', async () => {
    const res = await request(app).get('/api/salida-caja/config');
    expect(res.status).to.equal(401);
  });

  it('GET /config devuelve si el tenant del JWT requiere caja', async () => {
    const stub = sinon.stub(db, 'tenantUsaCaja').resolves(false);
    const res = await request(app).get('/api/salida-caja/config').set(auth);

    expect(res.status).to.equal(200);
    expect(res.body).to.deep.equal({ requiereCaja: false });
    expect(stub.firstCall.args[0]).to.equal(40);
  });

  it('GET /periodo con rango válido → 200 con los gastos del tenant del JWT', async () => {
    const stub = sinon.stub(db, 'getSalidasCajasPorPeriodo').resolves([{ id: 3, descripcion: 'Alquiler', monto: '150000.00' }]);
    const res = await request(app).get('/api/salida-caja/periodo?desde=2026-10-01&hasta=2026-10-31').set(auth);

    expect(res.status).to.equal(200);
    expect(res.body[0].descripcion).to.equal('Alquiler');
    expect(stub.firstCall.args[0]).to.equal(40);
  });

  it('GET /periodo con rango inválido → 400 RANGO_INVALIDO', async () => {
    const res = await request(app).get('/api/salida-caja/periodo?desde=2026-10-31&hasta=2026-10-01').set(auth);
    expect(res.status).to.equal(400);
    expect(res.body.code).to.equal('RANGO_INVALIDO');
  });

  it('GET /periodo con cliente_id ajeno en la query → 403', async () => {
    const res = await request(app).get('/api/salida-caja/periodo?desde=2026-10-01&hasta=2026-10-31&cliente_id=41').set(auth);
    expect(res.status).to.equal(403);
  });

  it('POST / toma usuario y tenant del JWT, no del body', async () => {
    sinon.stub(db, 'tenantUsaCaja').resolves(false);
    const create = sinon.stub(db, 'createSalidaCaja').callsFake(async (x) => ({ id: 1, ...x }));

    const res = await request(app).post('/api/salida-caja').set(auth)
      .send([{ categoria_salida_id: 1, descripcion: 'Alquiler', monto: 150000, usuario_id: 999 }]);

    expect(res.status).to.equal(201);
    expect(create.firstCall.args[0].usuario_id).to.equal(7);
    expect(create.firstCall.args[0].cliente_id).to.equal(40);
    expect(create.firstCall.args[0].registro_diario_id).to.equal(null);
  });

  it('POST / de un tenant con caja y sin registro diario → 400', async () => {
    sinon.stub(db, 'tenantUsaCaja').resolves(true);
    sinon.stub(db, 'createSalidaCaja');

    const res = await request(app).post('/api/salida-caja').set(auth)
      .send([{ categoria_salida_id: 1, descripcion: 'Luz', monto: 5000 }]);

    expect(res.status).to.equal(400);
    expect(res.body.error).to.match(/caja abierta/);
  });
});
