// tests/salidaCajaMedioPago.test.js
// Medio de pago en salidas de caja: validación, default a efectivo y gastos en efectivo del día.
const sinon = require('sinon');
const pool = require('../pool');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-tests';
const db = require('../model/salida_caja/db');
const service = require('../services/salidaCaja/salidaCajaService');

let expect;
before(async () => { ({ expect } = await import('chai')); });
afterEach(() => sinon.restore());

const GASTO = { categoria_salida_id: 1, descripcion: 'Proveedor', monto: 5000, usuario_id: 7, cliente_id: 40, registro_diario_id: 12 };

describe('salida_caja con medio de pago', () => {
  describe('service', () => {
    beforeEach(() => {
      sinon.stub(db, 'tenantUsaCaja').resolves(true);
      sinon.stub(db, 'getMediosPagoIds').resolves([1, 2, 3, 4]);
    });

    it('pasa medio_pago_id al model', async () => {
      const create = sinon.stub(db, 'createSalidaCaja').callsFake(async (x) => ({ id: 1, ...x }));
      await service.createSalidaCajaService([{ ...GASTO, medio_pago_id: 4 }]);
      expect(create.firstCall.args[0].medio_pago_id).to.equal(4);
    });

    it('sin medio_pago_id manda null (el model cae a efectivo) y no consulta el catálogo', async () => {
      const create = sinon.stub(db, 'createSalidaCaja').callsFake(async (x) => ({ id: 1, ...x }));
      await service.createSalidaCajaService([GASTO]);
      expect(create.firstCall.args[0].medio_pago_id).to.equal(null);
      expect(db.getMediosPagoIds.called).to.equal(false);
    });

    it('rechaza todo el lote si un medio es inválido (inexistente, string, decimal)', async () => {
      const create = sinon.stub(db, 'createSalidaCaja');
      for (const malo of [99, '2', 1.5, 0]) {
        let err;
        try { await service.createSalidaCajaService([GASTO, { ...GASTO, medio_pago_id: malo }]); } catch (e) { err = e; }
        expect(err && err.message, String(malo)).to.match(/Medio de pago inválido/);
      }
      expect(create.called).to.equal(false);
    });
  });

  describe('model', () => {
    it('insert: medio_pago_id va como $8 y cae a EFE si es null', async () => {
      const q = sinon.stub(pool, 'query').resolves({ rows: [{ id: 1 }] });
      await db.createSalidaCaja({ ...GASTO, medio_pago_id: null });
      const [sql, params] = q.firstCall.args;
      expect(sql).to.match(/COALESCE\(\$8::int, \(SELECT id FROM medio_pago WHERE codigo = 'EFE'\)\)/);
      expect(params).to.have.length(8);
      expect(params[7]).to.equal(null);
    });

    it('gastos en efectivo del día: filtra por caja, tenant y código EFE', async () => {
      const q = sinon.stub(pool, 'query').resolves({ rows: [{ sum: 1500 }] });
      const r = await db.getMontoGastosEfectivo(12, 40);
      const [sql, params] = q.firstCall.args;
      expect(r).to.equal(1500);
      expect(params).to.deep.equal([12, 40]);
      expect(sql).to.match(/sc\.cliente_id = \$2/);
      expect(sql).to.match(/mp\.codigo = 'EFE'/);
    });
  });
});
