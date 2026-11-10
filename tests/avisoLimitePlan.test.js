/**
 * avisoLimitePlan.test.js — aviso al comercio cuando se acerca / llega al límite de su plan
 *   - umbrales (80 % / 100 %) y uso de cada límite
 *   - mail: una vez por período, al contacto, fuera de la transacción del request
 *   - requireLimit: el 403 trae `code` y datos del límite
 *   - GET /api/cliente-plan/uso
 *   - template limite-plan
 */
const request = require('supertest');
const sinon = require('sinon');
const jwt = require('jsonwebtoken');

process.env.PLATFORM_BASE_URL = 'https://app.test.local';

const app = require('../node');
const pool = require('../pool');
const mailer = require('../services/email');
const planService = require('../services/cliente/planService');
const usoDb = require('../model/cliente/uso');
const usoPlan = require('../services/cliente/usoPlanService');
const avisoLimite = require('../services/cliente/avisoLimiteService');
const planBloqueo = require('../model/senales/planBloqueo');
const { requireLimit } = require('../middleware/limitMiddleware');

let expect;
before(async () => { ({ expect } = await import('chai')); });
beforeEach(() => avisoLimite._reset());
afterEach(() => sinon.restore());

const CONTACTO = { nombre: 'Pizzería Test', contacto_nombre: 'Marta', contacto_email: 'marta@pizza.com' };

const resFalso = () => {
  const res = { statusCode: 200, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
};
const plan = (features, extra = {}) => ({
  clienteId: 7, tierCode: 'FREE', tierNombre: 'Free', timezone: 'America/Argentina/Cordoba', isExpired: false, features, ...extra,
});

describe('usoPlanService — nivelPara', () => {
  it('lejos del tope no hay nivel; desde el 80 % es 80; en el tope es 100', () => {
    expect(usoPlan.nivelPara(39, 50)).to.equal(null);
    expect(usoPlan.nivelPara(40, 50)).to.equal(80);
    expect(usoPlan.nivelPara(49, 50)).to.equal(80);
    expect(usoPlan.nivelPara(50, 50)).to.equal(100);
    expect(usoPlan.nivelPara(60, 50)).to.equal(100);
  });

  it('redondea el umbral hacia arriba y tolera límites chicos', () => {
    expect(usoPlan.nivelPara(23, 30)).to.equal(null);
    expect(usoPlan.nivelPara(24, 30)).to.equal(80);
    expect(usoPlan.nivelPara(0, 1)).to.equal(null);
    expect(usoPlan.nivelPara(1, 1)).to.equal(100);
  });

  it('datos inválidos o sin límite no dan nivel', () => {
    expect(usoPlan.nivelPara(5, 0)).to.equal(null);
    expect(usoPlan.nivelPara('x', 50)).to.equal(null);
    expect(usoPlan.nivelPara(5, null)).to.equal(null);
  });
});

describe('usoPlanService — getUso', () => {
  it('sólo informa los límites que tiene el plan; los ilimitados no aparecen', async () => {
    const contar = sinon.stub(usoDb, 'contar');
    contar.withArgs('maxPedidosMensuales', 7).resolves(40);
    contar.withArgs('maxProductos', 7).resolves(12);
    const uso = await usoPlan.getUso(7, { maxPedidosMensuales: 50, maxProductos: 30, maxStockItems: null });
    expect(uso).to.deep.equal({
      maxPedidosMensuales: { usado: 40, limite: 50, porcentaje: 80, nivel: 80 },
      maxProductos: { usado: 12, limite: 30, porcentaje: 40, nivel: null },
    });
    expect(contar.calledWith('maxStockItems')).to.equal(false);
  });

  it('plan sin límites: objeto vacío y ninguna consulta', async () => {
    const contar = sinon.stub(usoDb, 'contar');
    expect(await usoPlan.getUso(7, { canUseReports: true })).to.deep.equal({});
    expect(contar.called).to.equal(false);
  });

  it('el porcentaje no pasa de 100 aunque el comercio esté por encima del tope', async () => {
    sinon.stub(usoDb, 'contar').resolves(70);
    const uso = await usoPlan.getUso(7, { maxPedidosMensuales: 50 });
    expect(uso.maxPedidosMensuales).to.include({ porcentaje: 100, nivel: 100 });
  });
});

describe('avisoLimiteService.evaluar', () => {
  const base = { clienteId: 7, limitKey: 'maxPedidosMensuales', limite: 50, tierCode: 'FREE', tierNombre: 'Free', timezone: 'America/Argentina/Cordoba' };

  it('lejos del tope: no consulta la base ni manda nada', async () => {
    const q = sinon.stub(pool, 'queryDirecta');
    const enq = sinon.stub(mailer, 'enqueue');
    const r = await avisoLimite.evaluar({ ...base, usado: 10 });
    expect(r).to.include({ enviado: false });
    expect(q.called || enq.called).to.equal(false);
  });

  it('80 %: un mail al contacto, con idempotencyKey del período y fuera de la transacción del request', async () => {
    const q = sinon.stub(pool, 'queryDirecta').resolves({ rows: [CONTACTO] });
    const enq = sinon.stub(mailer, 'enqueue').resolves({ id: 'm1', duplicado: false });
    const r = await avisoLimite.evaluar({ ...base, usado: 40 });
    expect(r).to.deep.include({ enviado: true, nivel: 80 });
    expect(q.firstCall.args[1]).to.deep.equal([7]);
    const [params, tx] = enq.firstCall.args;
    expect(params).to.include({ template: 'limite-plan', to: 'marta@pizza.com', toName: 'Marta', clienteId: 7 });
    expect(params.idempotencyKey).to.match(/^limite-plan:7:maxPedidosMensuales:80:\d{4}-\d{2}$/);
    expect(params.data).to.include({
      nombreComercio: 'Pizzería Test', tierNombre: 'Free', recurso: 'pedidos este mes', usado: 40, limite: 50,
      alcanzado: false, mensual: true, linkAfectado: true, urlPlan: 'https://app.test.local/dashboard/plan',
    });
    // el INSERT del outbox usa el pool directo (un 403 puede revertir la transacción del request)
    const poolQuery = sinon.stub(pool, 'query');
    await tx.query('SELECT 1', []);
    expect(poolQuery.called).to.equal(false);
    expect(q.lastCall.args[0]).to.equal('SELECT 1');
  });

  it('100 %: marca alcanzado y usa otra clave que el 80 %', async () => {
    sinon.stub(pool, 'queryDirecta').resolves({ rows: [CONTACTO] });
    const enq = sinon.stub(mailer, 'enqueue').resolves({ id: 'm1', duplicado: false });
    await avisoLimite.evaluar({ ...base, usado: 40 });
    await avisoLimite.evaluar({ ...base, usado: 50 });
    expect(enq.firstCall.args[0].data.alcanzado).to.equal(false);
    expect(enq.secondCall.args[0].data.alcanzado).to.equal(true);
    expect(enq.firstCall.args[0].idempotencyKey).to.not.equal(enq.secondCall.args[0].idempotencyKey);
  });

  it('el mismo aviso en el mismo proceso no vuelve a consultar ni a encolar', async () => {
    const q = sinon.stub(pool, 'queryDirecta').resolves({ rows: [CONTACTO] });
    const enq = sinon.stub(mailer, 'enqueue').resolves({ id: 'm1', duplicado: false });
    await avisoLimite.evaluar({ ...base, usado: 41 });
    const r = await avisoLimite.evaluar({ ...base, usado: 45 });
    expect(r).to.include({ enviado: false, motivo: 'ya_avisado' });
    expect(q.callCount).to.equal(1);
    expect(enq.callCount).to.equal(1);
  });

  it('si el outbox ya tenía ese aviso (otro proceso, o reinicio) no cuenta como enviado', async () => {
    sinon.stub(pool, 'queryDirecta').resolves({ rows: [CONTACTO] });
    sinon.stub(mailer, 'enqueue').resolves({ id: null, duplicado: true });
    const r = await avisoLimite.evaluar({ ...base, usado: 50 });
    expect(r).to.include({ enviado: false, motivo: 'ya_avisado' });
  });

  it('pedidos: la clave cambia con el mes del comercio; productos: una sola vez', () => {
    const feb = new Date('2026-02-15T15:00:00Z');
    const mar = new Date('2026-03-15T15:00:00Z');
    expect(avisoLimite.periodoDe('maxPedidosMensuales', 'America/Argentina/Cordoba', feb)).to.equal('2026-02');
    expect(avisoLimite.periodoDe('maxPedidosMensuales', 'America/Argentina/Cordoba', mar)).to.equal('2026-03');
    expect(avisoLimite.periodoDe('maxProductos', 'America/Argentina/Cordoba', feb)).to.equal('unico');
    expect(avisoLimite.periodoDe('maxStockItems', 'America/Argentina/Cordoba', mar)).to.equal('unico');
  });

  it('el mes se cuenta en la zona del comercio, no en UTC', () => {
    // 1/3 02:00 UTC todavía es 28/2 en Córdoba (UTC-3)
    const ahora = new Date('2026-03-01T02:00:00Z');
    expect(avisoLimite.periodoDe('maxPedidosMensuales', 'America/Argentina/Cordoba', ahora)).to.equal('2026-02');
    expect(avisoLimite.periodoDe('maxPedidosMensuales', 'UTC', ahora)).to.equal('2026-03');
  });

  it('productos: el aviso no menciona el link público', async () => {
    sinon.stub(pool, 'queryDirecta').resolves({ rows: [CONTACTO] });
    const enq = sinon.stub(mailer, 'enqueue').resolves({ id: 'm1', duplicado: false });
    await avisoLimite.evaluar({ ...base, limitKey: 'maxProductos', limite: 30, usado: 30 });
    expect(enq.firstCall.args[0].data).to.include({ recurso: 'productos', mensual: false, linkAfectado: false, alcanzado: true });
    expect(enq.firstCall.args[0].idempotencyKey).to.equal('limite-plan:7:maxProductos:100:unico');
  });

  it('sin email de contacto: no encola', async () => {
    sinon.stub(pool, 'queryDirecta').resolves({ rows: [{ ...CONTACTO, contacto_email: null }] });
    const enq = sinon.stub(mailer, 'enqueue');
    const r = await avisoLimite.evaluar({ ...base, usado: 50 });
    expect(r).to.include({ enviado: false, motivo: 'sin_email' });
    expect(enq.called).to.equal(false);
  });

  it('nunca lanza: si falla el encolado devuelve error y no memoriza (se reintenta en el próximo request)', async () => {
    sinon.stub(console, 'error');
    sinon.stub(pool, 'queryDirecta').resolves({ rows: [CONTACTO] });
    const enq = sinon.stub(mailer, 'enqueue');
    enq.onFirstCall().rejects(new Error('db caída'));
    enq.onSecondCall().resolves({ id: 'm1', duplicado: false });
    expect(await avisoLimite.evaluar({ ...base, usado: 50 })).to.include({ enviado: false, motivo: 'error' });
    expect(await avisoLimite.evaluar({ ...base, usado: 50 })).to.include({ enviado: true });
  });

  it('límite desconocido o cliente inválido: no hace nada', async () => {
    const q = sinon.stub(pool, 'queryDirecta');
    await avisoLimite.evaluar({ ...base, limitKey: 'maxCosas', usado: 50 });
    await avisoLimite.evaluar({ ...base, clienteId: 'x', usado: 50 });
    expect(q.called).to.equal(false);
  });
});

describe('requireLimit — 403 con datos del límite y aviso', () => {
  const req = { user: { cliente_id: 7, userId: 21 }, baseUrl: '/api/productos', path: '/' };

  it('en el tope: 403 con code LIMITE_PLAN y los números, y avisa con lo que ya tiene cargado', async () => {
    sinon.stub(planService, 'getClienteTierAndFeatures').resolves(plan({ maxProductos: 30 }));
    sinon.stub(usoDb, 'contar').resolves(30);
    sinon.stub(planBloqueo, 'registrar').resolves();
    const aviso = sinon.stub(avisoLimite, 'evaluar').resolves({ enviado: true });
    const res = resFalso(); const next = sinon.spy();
    await requireLimit('maxProductos')(req, res, next);
    expect(res.statusCode).to.equal(403);
    expect(next.called).to.equal(false);
    expect(res.body).to.deep.equal({
      error: 'Tu plan (FREE) permite hasta 30 productos. Ya alcanzaste el límite.',
      code: 'LIMITE_PLAN', limitKey: 'maxProductos', limite: 30, usado: 30, tierCode: 'FREE',
    });
    expect(aviso.firstCall.args[0]).to.deep.include({
      clienteId: 7, limitKey: 'maxProductos', usado: 30, limite: 30, tierCode: 'FREE', tierNombre: 'Free', timezone: 'America/Argentina/Cordoba',
    });
  });

  it('cerca del tope: deja pasar y avisa (el aviso del 80 % sale en el request que ya vio el uso alto)', async () => {
    sinon.stub(planService, 'getClienteTierAndFeatures').resolves(plan({ maxPedidosMensuales: 50 }));
    sinon.stub(usoDb, 'contar').resolves(40);
    const aviso = sinon.stub(avisoLimite, 'evaluar').resolves({ enviado: true });
    const next = sinon.spy();
    await requireLimit('maxPedidosMensuales')(req, resFalso(), next);
    expect(next.calledOnce).to.equal(true);
    expect(aviso.firstCall.args[0]).to.include({ usado: 40, limite: 50 });
  });

  it('si el aviso falla igual responde (el aviso nunca cambia el resultado del request)', async () => {
    sinon.stub(planService, 'getClienteTierAndFeatures').resolves(plan({ maxProductos: 30 }));
    sinon.stub(usoDb, 'contar').resolves(30);
    sinon.stub(planBloqueo, 'registrar').resolves();
    sinon.stub(console, 'error');
    sinon.stub(pool, 'queryDirecta').rejects(new Error('db caída'));
    const res = resFalso();
    await requireLimit('maxProductos')(req, res, sinon.spy());
    expect(res.statusCode).to.equal(403);
    expect(res.body.code).to.equal('LIMITE_PLAN');
  });

  it('plan sin tope: no cuenta ni avisa', async () => {
    sinon.stub(planService, 'getClienteTierAndFeatures').resolves(plan({ maxProductos: null }, { tierCode: 'BASIC' }));
    const contar = sinon.stub(usoDb, 'contar');
    const aviso = sinon.stub(avisoLimite, 'evaluar');
    const next = sinon.spy();
    await requireLimit('maxProductos')(req, resFalso(), next);
    expect(next.calledOnce).to.equal(true);
    expect(contar.called || aviso.called).to.equal(false);
  });

  it('límite sin contador: 500 explícito', async () => {
    sinon.stub(planService, 'getClienteTierAndFeatures').resolves(plan({ maxCosas: 5 }));
    const res = resFalso();
    await requireLimit('maxCosas')(req, res, sinon.spy());
    expect(res.statusCode).to.equal(500);
    expect(res.body.error).to.match(/no implementada/);
  });
});

describe('GET /api/cliente-plan/uso', () => {
  const auth = (over = {}) => ({
    Authorization: `Bearer ${jwt.sign({ userId: 'u-1', cliente_id: 7, role: ['admin'], modules: [], permissions: {}, ...over }, process.env.JWT_SECRET, { expiresIn: '1h' })}`,
  });
  // La ruta importa planService por destructuring: se stubea la base, no la función.
  const filaPlan = (rubro_features) => ({
    id: 7, nombre: 'Pizzería Test', tier_expiration_date: null, rubro_codigo: 'gastronomia', timezone: 'America/Argentina/Cordoba',
    vencido: false, tier_code: 'FREE', nombre_publico: 'Free', rubro_features,
  });

  it('devuelve el plan y el uso de sus límites', async () => {
    sinon.stub(pool, 'query').callsFake(async (sql) => {
      if (/FROM cliente c/.test(sql)) return { rows: [filaPlan({ maxProductos: 30, maxPedidosMensuales: 50 })] };
      if (/FROM producto/.test(sql)) return { rows: [{ count: '12' }] };
      if (/FROM pedido/.test(sql)) return { rows: [{ count: '41' }] };
      throw new Error(`consulta inesperada: ${sql}`);
    });
    const res = await request(app).get('/api/cliente-plan/uso').set(auth());
    expect(res.status).to.equal(200);
    expect(res.body.tierCode).to.equal('FREE');
    expect(res.body.uso.maxProductos).to.deep.equal({ usado: 12, limite: 30, porcentaje: 40, nivel: null });
    expect(res.body.uso.maxPedidosMensuales).to.deep.equal({ usado: 41, limite: 50, porcentaje: 82, nivel: 80 });
  });

  it('plan sin límites numéricos: uso vacío y sin conteos', async () => {
    const q = sinon.stub(pool, 'query').callsFake(async (sql) => {
      if (/FROM cliente c/.test(sql)) return { rows: [{ ...filaPlan({ maxProductos: null, maxPedidosMensuales: null, maxStockItems: null }), tier_code: 'PREMIUM' }] };
      throw new Error(`consulta inesperada: ${sql}`);
    });
    const res = await request(app).get('/api/cliente-plan/uso').set(auth());
    expect(res.status).to.equal(200);
    expect(res.body.uso).to.deep.equal({});
    expect(q.callCount).to.equal(1);
  });

  it('sin token: 401', async () => {
    const res = await request(app).get('/api/cliente-plan/uso');
    expect(res.status).to.equal(401);
  });

  it('si falla la base responde 500 sin filtrar el error', async () => {
    sinon.stub(console, 'error');
    sinon.stub(pool, 'query').rejects(new Error('boom interno'));
    const res = await request(app).get('/api/cliente-plan/uso').set(auth());
    expect(res.status).to.equal(500);
    expect(JSON.stringify(res.body)).to.not.contain('boom interno');
  });
});

describe('template limite-plan', () => {
  const data = (over = {}) => ({
    nombreContacto: 'Marta', nombreComercio: 'Pizzería Test', tierNombre: 'Free', recurso: 'pedidos este mes',
    usado: 40, limite: 50, alcanzado: false, mensual: true, linkAfectado: true, urlPlan: 'https://app.test.local/dashboard/plan', ...over,
  });

  it('80 %: asunto con el uso, cuerpo que avisa sin alarmar y link a los planes', () => {
    const out = mailer.render('limite-plan', data());
    expect(out.subject).to.equal('Ya usaste 40 de 50 pedidos este mes en Pizzería Test');
    expect(out.html).to.contain('Estás cerca del límite de pedidos este mes').and.to.contain('https://app.test.local/dashboard/plan');
    expect(out.text).to.contain('Hola Marta').and.to.contain('https://app.test.local/dashboard/plan');
    expect(out.text).to.not.contain('{{');
  });

  it('100 % de pedidos: avisa del link público y que los datos siguen', () => {
    const out = mailer.render('limite-plan', data({ usado: 50, alcanzado: true }));
    expect(out.subject).to.equal('Llegaste al límite de pedidos este mes de tu plan Free');
    expect(out.html).to.contain('tus clientes no van a poder hacer pedidos por tu link').and.to.contain('esperar al mes que viene');
    expect(out.text).to.contain('no se pierde nada');
  });

  it('100 % de productos: sin espera de mes ni mención al link', () => {
    const out = mailer.render('limite-plan', data({ recurso: 'productos', usado: 30, limite: 30, alcanzado: true, mensual: false, linkAfectado: false }));
    expect(out.html).to.not.contain('esperar al mes que viene').and.to.not.contain('por tu link');
    expect(out.text).to.not.contain('mes que viene');
  });

  it('sin nombre de contacto: saluda sin dejar huecos', () => {
    expect(mailer.render('limite-plan', data({ nombreContacto: '' })).text).to.match(/^Hola,/);
  });
});
