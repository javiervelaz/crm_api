/**
 * inventarioFase0.test.js — cimientos del módulo inventario (migración 025)
 */
const fs = require('fs');
const path = require('path');
const sinon = require('sinon');

const pool = require('../pool');
const planService = require('../services/cliente/planService');
const { requireLimit } = require('../middleware/limitMiddleware');

let expect;
before(async () => { ({ expect } = await import('chai')); });
afterEach(() => sinon.restore());

const correr = async (mw, req) => {
  const res = { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
  let siguio = false;
  await mw(req, res, () => { siguio = true; });
  return { res, siguio };
};

describe('Inventario — features por tier (defaults)', () => {
  it('FREE sin inventario; BASIC con tope de 50 y sin recetas; PREMIUM/CUSTOM sin tope y con recetas', () => {
    const F = planService.PLAN_FEATURES;
    expect(F.FREE).to.include({ canUseInventario: false, canUseRecetas: false });
    expect(F.BASIC).to.include({ canUseInventario: true, canUseRecetas: false, maxStockItems: 50 });
    expect(F.PREMIUM).to.include({ canUseInventario: true, canUseRecetas: true, maxStockItems: null });
    expect(F.CUSTOM).to.include({ canUseInventario: true, canUseRecetas: true, maxStockItems: null });
  });
});

describe('Inventario — requireLimit(maxStockItems)', () => {
  const req = { user: { cliente_id: 7 } };

  it('cuenta sólo ítems activos del tenant y bloquea al llegar al tope', async () => {
    sinon.stub(planService, 'getClienteTierAndFeatures').resolves({ features: { maxStockItems: 50 }, tierCode: 'BASIC' });
    const q = sinon.stub(pool, 'query').resolves({ rows: [{ count: '50' }] });
    const { res, siguio } = await correr(requireLimit('maxStockItems'), req);
    expect(siguio).to.equal(false);
    expect(res.statusCode).to.equal(403);
    expect(res.body.error).to.match(/50 ítems de stock/);
    const sql = q.firstCall.args[0].replace(/\s+/g, ' ').toUpperCase();
    expect(sql).to.include('FROM STOCK_ITEM WHERE CLIENTE_ID = $1 AND ACTIVO = TRUE');
    expect(q.firstCall.args[1]).to.deep.equal([7]);
  });

  it('deja pasar por debajo del tope', async () => {
    sinon.stub(planService, 'getClienteTierAndFeatures').resolves({ features: { maxStockItems: 50 }, tierCode: 'BASIC' });
    sinon.stub(pool, 'query').resolves({ rows: [{ count: '49' }] });
    const { siguio } = await correr(requireLimit('maxStockItems'), req);
    expect(siguio).to.equal(true);
  });

  it('sin tope (null) no consulta la base', async () => {
    sinon.stub(planService, 'getClienteTierAndFeatures').resolves({ features: { maxStockItems: null }, tierCode: 'PREMIUM' });
    const q = sinon.stub(pool, 'query');
    const { siguio } = await correr(requireLimit('maxStockItems'), req);
    expect(siguio).to.equal(true);
    expect(q.called).to.equal(false);
  });
});

describe('Inventario — migración 025 (chequeos estáticos)', () => {
  const sql = fs.readFileSync(path.join(__dirname, '../migrations/025_inventario.sql'), 'utf8');
  const tabla = (n) => sql.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${n} \\(([\\s\\S]*?)\\n\\);`))[1];

  it('aborta si las tablas legacy tienen filas antes de dropearlas', () => {
    expect(sql.indexOf('RAISE EXCEPTION')).to.be.lessThan(sql.indexOf('DROP TABLE IF EXISTS'));
  });

  it('cliente_id NOT NULL y sin DEFAULT en las tablas nuevas', () => {
    for (const t of ['stock_item', 'stock_movimiento']) {
      const linea = tabla(t).split('\n').find((l) => /^\s*cliente_id\s/.test(l));
      expect(linea, t).to.match(/NOT NULL/);
      expect(linea.replace(/--.*$/, ''), t).to.not.match(/DEFAULT/);
    }
  });

  it('el movimiento referencia al ítem por (id, cliente_id)', () => {
    expect(tabla('stock_movimiento')).to.match(/FOREIGN KEY \(stock_item_id, cliente_id\)\s+REFERENCES stock_item \(id, cliente_id\)/);
  });

  it('pedido y gasto borrados no rompen el ledger (ON DELETE SET NULL)', () => {
    const t = tabla('stock_movimiento');
    expect(t).to.match(/pedido_id\s+INT\s+REFERENCES pedido \(id\)\s+ON DELETE SET NULL/);
    expect(t).to.match(/salida_caja_id\s+INT\s+REFERENCES salida_caja \(id\) ON DELETE SET NULL/);
  });

  it('las features no pisan valores ya cargados en rubro_tier', () => {
    const updates = sql.match(/UPDATE rubro_tier[\s\S]*?;/g);
    expect(updates).to.have.length(2);
    for (const u of updates) expect(u).to.include("NOT");
  });
});

describe('Inventario — purga de tenants', () => {
  const src = fs.readFileSync(path.join(__dirname, '../scripts/purgeClientes.js'), 'utf8');

  it('no referencia tablas legacy', () => {
    expect(src).to.not.match(/compra_insumo|inventario_insumos|movimiento_inventario/);
  });

  it('borra stock_movimiento antes que pedido, salida_caja, user y stock_item', () => {
    const pos = (t) => src.indexOf(`['${t}'`);
    const mov = pos('stock_movimiento');
    expect(mov).to.be.greaterThan(-1);
    for (const t of ['pedido', 'salida_caja', '"user"', 'stock_item']) expect(mov, t).to.be.lessThan(pos(t));
  });
});
