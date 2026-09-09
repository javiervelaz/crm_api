const sinon = require('sinon');
const productoService = require('../services/producto/productoService');
const productoDb = require('../model/producto/db');
const opsService = require('../services/operaciones_diarias/operacionesDiariasService');
const registroDb = require('../model/registro_diario/db');

let expect;

describe('Tanda 3 — validaciones de dominio', () => {
  before(async () => { expect = (await import('chai')).expect; });
  afterEach(() => sinon.restore());

  describe('Producto: precio (bugs 30/31)', () => {
    it('rechaza precio 0 con "mayor a 0" (no "campo requerido")', async () => {
      try {
        await productoService.createProductoService({ nombre: 'X', precio_unitario: 0, cliente_id: 1 });
        throw new Error('no lanzó');
      } catch (e) {
        expect(e.status).to.equal(400);
        expect(e.message).to.match(/mayor a 0/i);
      }
    });

    it('rechaza precio negativo', async () => {
      try {
        await productoService.createProductoService({ nombre: 'X', precio_unitario: -5, cliente_id: 1 });
        throw new Error('no lanzó');
      } catch (e) {
        expect(e.status).to.equal(400);
        expect(e.message).to.match(/mayor a 0/i);
      }
    });

    it('rechaza precio vacío como requerido', async () => {
      try {
        await productoService.createProductoService({ nombre: 'X', precio_unitario: '', cliente_id: 1 });
        throw new Error('no lanzó');
      } catch (e) {
        expect(e.status).to.equal(400);
        expect(e.message).to.match(/requerido/i);
      }
    });

    it('acepta precio válido (>0)', async () => {
      sinon.stub(productoDb, 'createProducto').resolves({ id: 1, precio_unitario: 100 });
      const r = await productoService.createProductoService({ nombre: 'X', precio_unitario: 100, cliente_id: 1 });
      expect(r).to.have.property('id', 1);
    });

    it('update también valida precio negativo', async () => {
      try {
        await productoService.updateProductoService(1, { nombre: 'X', precio_unitario: -1, cliente_id: 1 });
        throw new Error('no lanzó');
      } catch (e) {
        expect(e.status).to.equal(400);
        expect(e.message).to.match(/mayor a 0/i);
      }
    });
  });

  describe('Apertura de caja: monto inicial (bug 34)', () => {
    it('rechaza monto negativo', async () => {
      try {
        await opsService.registrarAperturaCierreCaja(new Date(), 1, -100, 1, null, null, 1);
        throw new Error('no lanzó');
      } catch (e) {
        expect(e.status).to.equal(400);
        expect(e.message).to.match(/negativo/i);
      }
    });

    it('rechaza monto vacío como requerido', async () => {
      try {
        await opsService.registrarAperturaCierreCaja(new Date(), 1, '', 1, null, null, 1);
        throw new Error('no lanzó');
      } catch (e) {
        expect(e.status).to.equal(400);
        expect(e.message).to.match(/requerido/i);
      }
    });

    it('acepta monto 0 (válido) y crea el registro', async () => {
      sinon.stub(registroDb, 'getCajasAbiertasByCliente').resolves([]);
      sinon.stub(registroDb, 'createRegistroDiario').resolves({ id: 9, caja_inicial: 0 });
      const r = await opsService.registrarAperturaCierreCaja(new Date(), 1, 0, 1, null, null, 1);
      expect(r).to.have.property('id', 9);
    });
  });
});
