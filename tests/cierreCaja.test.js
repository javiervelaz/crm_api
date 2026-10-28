const request = require('supertest');
const sinon = require('sinon');
const jwt = require('jsonwebtoken');
const app = require('../node');
const pool = require('../pool');
const operacionesService = require('../services/operaciones_diarias/operacionesDiariasService');
const RegistroDiario = require('../model/registro_diario/db');

let expect;

describe('Cierre de caja: diferencia y totales los calcula el servidor', () => {
  let token;
  before(async () => {
    ({ expect } = await import('chai'));
    token = jwt.sign(
      { userId: 7, cliente_id: 1, username: 'caja', sucursal: 1, role: ['admin'], modules: ['operaciones'], permissions: {} },
      process.env.JWT_SECRET,
      { expiresIn: '1h' },
    );
  });
  afterEach(() => sinon.restore());

  const cerrar = (body) =>
    request(app)
      .put('/api/operaciones/cierre-caja')
      .set('Authorization', 'Bearer ' + token)
      .send({ id: 10, monto_final: 8000, usuario_cierre_id: 7, sucursal_id: 1, cliente_id: 1, ...body });

  describe('controller', () => {
    it('pasa efectivo contado y los extras (top-level o en detalles) al service', async () => {
      const stub = sinon.stub(operacionesService, 'actualizarRegistroDiarioService').resolves([{ id: 10 }]);
      const res = await cerrar({
        efectivo_contado: 5350,
        detalles: { otros_ingresos: 200, gastos_administrativos: 100, otros_egresos: 700 },
      });
      expect(res.status).to.equal(200);
      const arg = stub.firstCall.args[0];
      expect(arg).to.include({ id: 10, monto_final: 8000, cliente_id: 1, efectivo_contado: 5350, otros_ingresos: 200, gastos_administrativos: 100 });
    });

    it('sin efectivo contado: no hay diferencia (null) y los extras valen 0', async () => {
      const stub = sinon.stub(operacionesService, 'actualizarRegistroDiarioService').resolves([{ id: 10 }]);
      const res = await cerrar({});
      expect(res.status).to.equal(200);
      expect(stub.firstCall.args[0]).to.include({ efectivo_contado: null, otros_ingresos: 0, gastos_administrativos: 0 });
    });

    it('un monto negativo o no numérico se rechaza con 400 y no llega al service', async () => {
      const stub = sinon.stub(operacionesService, 'actualizarRegistroDiarioService').resolves([]);
      for (const malo of [{ efectivo_contado: -1 }, { efectivo_contado: 'abc' }, { otros_ingresos: -5 }, { detalles: { gastos_administrativos: 'x' } }]) {
        const res = await cerrar(malo);
        expect(res.status, JSON.stringify(malo)).to.equal(400);
      }
      expect(stub.called).to.equal(false);
    });
  });

  describe('model', () => {
    it('el UPDATE va filtrado por tenant en las 3 tablas y manda los parámetros en orden', async () => {
      const q = sinon.stub(pool, 'query').resolves({ rows: [{ id: 10 }] });
      await RegistroDiario.updateMontoFinalRegistroDiario(10, 8000, 7, 1, 1, { efectivo_contado: 5350, otros_ingresos: 200, gastos_administrativos: 100 });
      const [sql, params] = q.firstCall.args;
      expect(params).to.deep.equal([10, 8000, 7, 1, 1, 5350, 200, 100]);
      expect(sql).to.match(/p\.cliente_id = \$5/);
      expect(sql).to.match(/s\.cliente_id = \$5/);
      expect(sql).to.match(/rd\.cliente_id = \$5/);
      expect(sql).to.match(/mp\.codigo = 'EFE'/); // efectivo vs digital por código de medio de pago
      expect(sql).to.match(/diferencias_caja/);
    });

    it('sin extras usa defaults: no cuenta efectivo (null) y suma 0', async () => {
      const q = sinon.stub(pool, 'query').resolves({ rows: [] });
      await RegistroDiario.updateMontoFinalRegistroDiario(10, 8000, 7, 1, 1);
      expect(q.firstCall.args[1].slice(5)).to.deep.equal([null, 0, 0]);
    });

    it('detalle: numeric llega como string y el saldo se suma, no se concatena', async () => {
      sinon.stub(console, 'log');
      const q = sinon.stub(pool, 'query');
      q.onCall(0).resolves({ rows: [{ id: 10, caja_inicial: '1000.00', caja_final: '8000.00', gatos_total: '700.00', diferencias_caja: null, ventas_efectivo: '5000.00', ventas_digital: null, retiros_total: null }] });
      q.onCall(1).resolves({ rows: [{ id: 1, monto_total: '5000.00', medio_pago: 'Efectivo' }] });
      q.onCall(2).resolves({ rows: [{ id: 1, monto: '700.00' }] });
      const d = await RegistroDiario.getRegistrosDiariosDetalle(10, 1);
      expect(d.saldo_final).to.equal(5300);
      expect(d.registro.caja_inicial).to.equal(1000);
      expect(d.registro.diferencias_caja).to.equal(null);
      expect(d.registro.gastos_total).to.equal(700); // nombre que usa el front para gatos_total
      expect(d.registro.ventas_digital).to.equal(null);
    });
  });

  describe('endpoints de inventario legacy', () => {
    it('ya no existen (no hay módulo, permisos ni cliente_id en esos inserts)', async () => {
      for (const [metodo, ruta] of [
        ['get', '/api/operaciones/consultar-inventario-insumos/1'],
        ['post', '/api/operaciones/registrar-movimiento-inventario'],
        ['post', '/api/operaciones/registrar-compra-insumo'],
        ['put', '/api/operaciones/actualizar-inventario-insumos/1'],
      ]) {
        const res = await request(app)[metodo](ruta).set('Authorization', 'Bearer ' + token).send({});
        expect(res.status, ruta).to.equal(404);
      }
    });
  });
});
