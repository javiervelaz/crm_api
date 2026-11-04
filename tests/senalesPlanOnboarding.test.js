// tests/senalesPlanOnboarding.test.js — migración 029: choques contra el plan y
// hitos de onboarding (señales para el curador, casos 3 y 4).
const fs = require('fs');
const path = require('path');
const sinon = require('sinon');
const pool = require('../pool');
const planService = require('../services/cliente/planService');
const planBloqueo = require('../model/senales/planBloqueo');
const { requireFeature } = require('../middleware/featureMiddleware');
const { requireLimit } = require('../middleware/limitMiddleware');

let expect;
before(async () => { ({ expect } = await import('chai')); });
afterEach(() => sinon.restore());

const resFalso = () => {
  const res = { statusCode: 200, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
};
const reqFalso = (over = {}) => ({ baseUrl: '/api/reportes', path: '/ventas/55', user: { cliente_id: 7, userId: 21 }, clienteId: 7, ...over });
const plan = (features, extra = {}) => ({ tierCode: 'FREE', isExpired: false, features, ...extra });

describe('señales — requireFeature registra el 403 de plan', () => {
  it('feature apagada: 403 y una señal tipo feature, sin ids en la ruta', async () => {
    sinon.stub(planService, 'getClienteTierAndFeatures').resolves(plan({ canUseReports: false }));
    const reg = sinon.stub(planBloqueo, 'registrar').resolves();
    const res = resFalso(); const next = sinon.spy();
    await requireFeature('canUseReports')(reqFalso(), res, next);
    expect(res.statusCode).to.equal(403);
    expect(next.called).to.equal(false);
    expect(reg.firstCall.args[0]).to.deep.equal({ clienteId: 7, tipo: 'feature', clave: 'canUseReports', tierCode: 'FREE', ruta: '/api/reportes/ventas/:id', userId: 21 });
  });

  it('plan vencido: señal tipo vencido', async () => {
    sinon.stub(planService, 'getClienteTierAndFeatures').resolves(plan({ canUseReports: true }, { isExpired: true, tierCode: 'BASIC' }));
    const reg = sinon.stub(planBloqueo, 'registrar').resolves();
    await requireFeature('canUseReports')(reqFalso(), resFalso(), sinon.spy());
    expect(reg.firstCall.args[0]).to.include({ tipo: 'vencido', clave: 'canUseReports', tierCode: 'BASIC' });
  });

  it('con acceso no registra nada', async () => {
    sinon.stub(planService, 'getClienteTierAndFeatures').resolves(plan({ canUseReports: true }));
    const reg = sinon.stub(planBloqueo, 'registrar').resolves();
    const next = sinon.spy();
    await requireFeature('canUseReports')(reqFalso(), resFalso(), next);
    expect(next.calledOnce).to.equal(true);
    expect(reg.called).to.equal(false);
  });

  it('si guardar la señal falla, el usuario igual recibe su 403 (no un 500)', async () => {
    sinon.stub(planService, 'getClienteTierAndFeatures').resolves(plan({ canUseReports: false }));
    sinon.stub(planBloqueo, 'registrar').rejects(new Error('db caída'));
    sinon.stub(console, 'error');
    const res = resFalso();
    await requireFeature('canUseReports')(reqFalso(), res, sinon.spy());
    expect(res.statusCode).to.equal(403);
    expect(res.body.code).to.equal('PLAN_INACTIVE');
  });
});

describe('señales — requireLimit registra el límite alcanzado', () => {
  it('límite alcanzado: 403 y señal tipo limite', async () => {
    sinon.stub(planService, 'getClienteTierAndFeatures').resolves(plan({ maxProductos: 20 }));
    sinon.stub(pool, 'query').resolves({ rows: [{ count: '20' }] });
    const reg = sinon.stub(planBloqueo, 'registrar').resolves();
    const res = resFalso();
    await requireLimit('maxProductos')(reqFalso({ baseUrl: '/api/productos', path: '/' }), res, sinon.spy());
    expect(res.statusCode).to.equal(403);
    expect(reg.firstCall.args[0]).to.include({ clienteId: 7, tipo: 'limite', clave: 'maxProductos', tierCode: 'FREE', userId: 21 });
  });

  it('bajo el límite: pasa y no registra', async () => {
    sinon.stub(planService, 'getClienteTierAndFeatures').resolves(plan({ maxProductos: 20 }));
    sinon.stub(pool, 'query').resolves({ rows: [{ count: '3' }] });
    const reg = sinon.stub(planBloqueo, 'registrar').resolves();
    const next = sinon.spy();
    await requireLimit('maxProductos')(reqFalso(), resFalso(), next);
    expect(next.calledOnce).to.equal(true);
    expect(reg.called).to.equal(false);
  });

  it('bug previo: si el plan no se puede leer responde 500 en vez de colgar el request', async () => {
    sinon.stub(planService, 'getClienteTierAndFeatures').rejects(new Error('db caída'));
    sinon.stub(console, 'error');
    const res = resFalso();
    await requireLimit('maxProductos')(reqFalso(), res, sinon.spy());
    expect(res.statusCode).to.equal(500);
  });
});

describe('señales — planBloqueo (SQL)', () => {
  it('upsert por hora con contador, fuera de la transacción del request', async () => {
    const q = sinon.stub(pool, 'queryDirecta').resolves({ rows: [] });
    const p = sinon.stub(pool, 'query');
    await planBloqueo.registrar({ clienteId: 7, tipo: 'feature', clave: 'canUseReports', tierCode: 'FREE', ruta: '/api/x', userId: 21 });
    const [sql, params] = q.firstCall.args;
    expect(p.called).to.equal(false);
    expect(sql).to.match(/date_trunc\('hour', now\(\)\)/);
    expect(sql).to.match(/ON CONFLICT \(cliente_id, hora, tipo, clave\) DO UPDATE/);
    expect(sql).to.match(/veces = plan_bloqueo\.veces \+ 1/);
    expect(params).to.deep.equal([7, 'feature', 'canUseReports', 'FREE', '/api/x', 21]);
  });

  it('datos inválidos no escriben nada', async () => {
    const q = sinon.stub(pool, 'queryDirecta').resolves({ rows: [] });
    await planBloqueo.registrar({ clienteId: 'x', tipo: 'feature', clave: 'a' });
    await planBloqueo.registrar({ clienteId: 7, tipo: 'otro', clave: 'a' });
    await planBloqueo.registrar({ clienteId: 7, tipo: 'feature', clave: '' });
    expect(q.called).to.equal(false);
  });

  it('rutaSegura: sin querystring ni ids', () => {
    expect(planBloqueo.rutaSegura({ baseUrl: '/api/reportes', path: '/ventas/123/detalle?desde=2026-01-01' })).to.equal('/api/reportes/ventas/:id/detalle');
    expect(planBloqueo.rutaSegura({ baseUrl: '/api/x', route: { path: '/:id' } })).to.equal('/api/x/:id');
  });
});

describe('señales — migración 029 (estructura)', () => {
  const sql = fs.readFileSync(path.join(__dirname, '../migrations/029_senales_plan_onboarding.sql'), 'utf8');
  const HITOS = ['registro', 'primer_producto', 'primer_pedido', 'primera_caja', 'primer_cierre',
    'primer_gasto', 'primer_stock', 'bot_conectado', 'primer_vinculo_bot', 'primer_empleado'];

  it('cada hito del CHECK tiene su trigger y su backfill', () => {
    for (const h of HITOS) {
      expect(sql, h).to.match(new RegExp(`registrar_onboarding_hito\\('${h}'\\)`));
      expect(sql, h).to.match(new RegExp(`'${h}',[^;]*'backfill'`));
    }
  });

  it('el trigger nunca rompe la operación de negocio y el hito es inmutable', () => {
    expect(sql).to.match(/EXCEPTION WHEN OTHERS THEN\s+[\s\S]*RAISE WARNING[\s\S]*RETURN NULL/);
    expect(sql).to.match(/ON CONFLICT \(cliente_id, hito\) DO NOTHING/);
  });

  it('los campos de NEW propios de una tabla sólo se leen dentro de un IF de esa rama', () => {
    // plpgsql compila la expresión entera: un CASE o un AND que mencione
    // NEW.cliente_id / NEW.user_type_id falla en las tablas que no los tienen.
    expect(sql).to.not.match(/CASE WHEN TG_TABLE_NAME/);
    expect(sql).to.match(/IF TG_TABLE_NAME = 'cliente' THEN\s+v_cliente := NEW\.id;/);
    expect(sql).to.not.match(/v_hito = 'primer_empleado' AND/);
    expect(sql).to.match(/IF v_hito = 'primer_empleado' THEN\s+(--[^\n]*\s+)*IF NOT EXISTS/);
  });

  it('el purge de clientes incluye las tablas nuevas', () => {
    const purge = fs.readFileSync(path.join(__dirname, '../scripts/purgeClientes.js'), 'utf8');
    expect(purge).to.match(/'plan_bloqueo'/).and.to.match(/'onboarding_hito'/);
  });
});
