// tests/metaCapi.test.js
const { expect } = require('chai');
const sinon = require('sinon');
const request = require('supertest');

const pool = require('../pool');
const app = require('../node');
const ClienteService = require('../services/cliente/clienteService');
const mailer = require('../services/email');
const capi = require('../services/tracking/metaCapiService');

const sha = (v) => require('crypto').createHash('sha256').update(v).digest('hex');

const ENV = ['META_PIXEL_ID', 'META_CAPI_TOKEN', 'META_CAPI_TEST_CODE', 'META_GRAPH_VERSION'];
const guardarEnv = () => Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
const restaurarEnv = (prev) => ENV.forEach((k) => (prev[k] === undefined ? delete process.env[k] : (process.env[k] = prev[k])));
const configurar = () => {
  process.env.META_PIXEL_ID = '1676279937419088';
  process.env.META_CAPI_TOKEN = 'token-secreto-de-prueba';
  delete process.env.META_CAPI_TEST_CODE;
};

describe('metaCapiService — helpers', () => {
  it('hashea normalizado (trim + minúsculas)', () => {
    expect(capi.hashear('  Hola@Mail.COM ')).to.equal(sha('hola@mail.com'));
    expect(capi.hashear('')).to.equal(undefined);
    expect(capi.hashear(null)).to.equal(undefined);
  });

  it('normaliza teléfonos argentinos a código de país', () => {
    expect(capi.normalizarTelefono('351 334-4326')).to.equal('543513344326');
    expect(capi.normalizarTelefono('0351 3344326')).to.equal('543513344326');
    expect(capi.normalizarTelefono('5493513344326')).to.equal('5493513344326');
  });

  it('limpia el prefijo IPv4-mapeado', () => {
    expect(capi.limpiarIp('::ffff:190.1.2.3')).to.equal('190.1.2.3');
    expect(capi.limpiarIp('2800:40::1')).to.equal('2800:40::1');
    expect(capi.limpiarIp(null)).to.equal(undefined);
  });

  it('arma fbc desde fbclid solo si no vino la cookie', () => {
    expect(capi.resolverFbc('fb.1.1.abc', 'zzz')).to.equal('fb.1.1.abc');
    expect(capi.resolverFbc(undefined, 'zzz', 1700000000000)).to.equal('fb.1.1700000000000.zzz');
    expect(capi.resolverFbc(undefined, undefined)).to.equal(undefined);
  });

  it('user_data no incluye campos vacíos y siempre hashea el email', () => {
    const u = capi.armarUserData({ email: 'A@b.com', clienteId: 7, userAgent: 'UA' });
    expect(u.em).to.deep.equal([sha('a@b.com')]);
    expect(u.external_id).to.deep.equal([sha('7')]);
    expect(u).to.not.have.property('ph');
    expect(u).to.not.have.property('fbp');
    expect(u.client_user_agent).to.equal('UA');
  });
});

describe('metaCapiService — envío', () => {
  let prev;
  beforeEach(() => { prev = guardarEnv(); capi._reset(); });
  afterEach(() => { sinon.restore(); restaurarEnv(prev); });

  it('apagado sin variables: no hace fetch ni queries', async () => {
    delete process.env.META_PIXEL_ID;
    delete process.env.META_CAPI_TOKEN;
    const f = sinon.stub(global, 'fetch');
    const q = sinon.stub(pool, 'queryDirecta');
    expect(capi.configurado()).to.equal(false);
    expect(await capi.enviarEvento({ eventName: 'X' })).to.equal(false);
    expect(await capi.notificarPrimerPedido(1)).to.equal(false);
    expect(f.called).to.equal(false);
    expect(q.called).to.equal(false);
  });

  it('manda el payload esperado a Graph y devuelve true', async () => {
    configurar();
    process.env.META_CAPI_TEST_CODE = 'TEST80944';
    const f = sinon.stub(global, 'fetch').resolves({ ok: true, status: 200 });
    const ok = await capi.enviarEvento({
      eventName: 'CompleteRegistration', eventId: 'ev-1', eventTime: 1700000000,
      sourceUrl: 'https://app.countercrm.com/saas', userData: { em: ['h'] }, customData: { plan: 'FREE', vacio: '' },
    });
    expect(ok).to.equal(true);
    const [url, init] = f.firstCall.args;
    expect(url).to.equal('https://graph.facebook.com/v23.0/1676279937419088/events');
    const body = JSON.parse(init.body);
    expect(body.access_token).to.equal('token-secreto-de-prueba');
    expect(body.test_event_code).to.equal('TEST80944');
    expect(body.data[0]).to.include({ event_name: 'CompleteRegistration', event_id: 'ev-1', event_time: 1700000000, action_source: 'website' });
    expect(body.data[0].custom_data).to.deep.equal({ plan: 'FREE' });
    expect(url).to.not.include('token');
  });

  it('un rechazo de Meta devuelve false sin tirar y sin loguear el token', async () => {
    configurar();
    sinon.stub(global, 'fetch').resolves({ ok: false, status: 400, json: async () => ({ error: { type: 'OAuthException', code: 190, message: 'Token inválido' } }) });
    const err = sinon.stub(console, 'error');
    expect(await capi.enviarEvento({ eventName: 'X' })).to.equal(false);
    expect(err.firstCall.args.join(' ')).to.include('190');
    expect(err.firstCall.args.join(' ')).to.not.include('token-secreto-de-prueba');
  });

  it('un error de red devuelve false sin tirar', async () => {
    configurar();
    sinon.stub(global, 'fetch').rejects(new Error('ECONNRESET'));
    sinon.stub(console, 'error');
    expect(await capi.enviarEvento({ eventName: 'X' })).to.equal(false);
  });
});

describe('metaCapiService — FirstOrder', () => {
  let prev;
  const fila = { id: 5, contacto_email: 'Dueño@Local.com', contacto_nombre: 'Ana', contacto_apellido: 'Pérez', contacto_telefono: '3513344326',
    signup_ip: '::ffff:190.1.2.3', meta_fbp: 'fb.1.1.1', meta_fbc: 'fb.1.1.abc', meta_ua: 'UA', utm_source: 'facebook', utm_campaign: 'c1', utm_content: 'v1', rubro_codigo: 'gastronomia' };

  beforeEach(() => { prev = guardarEnv(); capi._reset(); configurar(); });
  afterEach(() => { sinon.restore(); restaurarEnv(prev); });

  it('envía una sola vez: reclama con UPDATE condicional y manda el evento', async () => {
    const q = sinon.stub(pool, 'queryDirecta').resolves({ rows: [fila] });
    const f = sinon.stub(global, 'fetch').resolves({ ok: true, status: 200 });
    expect(await capi.notificarPrimerPedido(5)).to.equal(true);
    expect(q.firstCall.args[0]).to.match(/meta_first_order_sent_at IS NULL/);
    const body = JSON.parse(f.firstCall.args[1].body);
    expect(body.data[0].event_name).to.equal('FirstOrder');
    expect(body.data[0].event_id).to.equal('firstorder-5');
    expect(body.data[0].user_data.client_ip_address).to.equal('190.1.2.3');
    expect(body.data[0].user_data.em).to.deep.equal([sha('dueño@local.com')]);
    expect(body.data[0].custom_data.utm_content).to.equal('v1');
    // segundo pedido del mismo proceso: ni query ni fetch
    expect(await capi.notificarPrimerPedido(5)).to.equal(false);
    expect(q.callCount).to.equal(1);
    expect(f.callCount).to.equal(1);
  });

  it('si otro proceso ya lo envió (UPDATE sin filas) no manda nada', async () => {
    sinon.stub(pool, 'queryDirecta').resolves({ rows: [] });
    const f = sinon.stub(global, 'fetch');
    expect(await capi.notificarPrimerPedido(5)).to.equal(false);
    expect(f.called).to.equal(false);
  });

  it('si Meta falla libera la marca para reintentar con el próximo pedido', async () => {
    const q = sinon.stub(pool, 'queryDirecta');
    q.onFirstCall().resolves({ rows: [fila] });
    q.onSecondCall().resolves({ rows: [] });
    sinon.stub(global, 'fetch').resolves({ ok: false, status: 500, json: async () => ({}) });
    sinon.stub(console, 'error');
    expect(await capi.notificarPrimerPedido(5)).to.equal(false);
    expect(q.secondCall.args[0]).to.match(/meta_first_order_sent_at = NULL/);
  });

  it('un error de base no tira', async () => {
    sinon.stub(pool, 'queryDirecta').rejects(new Error('db caída'));
    sinon.stub(console, 'error');
    expect(await capi.notificarPrimerPedido(5)).to.equal(false);
  });
});

describe('signup — atribución y CompleteRegistration', () => {
  let prev;
  const body = (over = {}) => ({
    comercioNombre: 'Pizzería Don Pepe', cuit: '20-12345678-6', adminNombre: 'Ana', adminApellido: 'Pérez',
    adminEmail: 'ana@pizza.com', password: 'Clave12345', plan: 'FREE', aceptaTerminos: 'true', ...over,
  });
  const prov = () => sinon.stub(ClienteService, 'createClienteService').resolves({
    cliente: { id: 9, nombre: 'Pizzería Don Pepe', cuit: '20123456786' }, tier: { code: 'FREE', nombre_publico: 'Free' }, esPago: false,
    adminUser: { id: 1, nombre: 'Ana', apellido: 'Pérez', email: 'ana@pizza.com', cliente_id: 9 },
  });

  beforeEach(() => { prev = guardarEnv(); sinon.stub(mailer, 'drain').resolves({}); });
  afterEach(() => { sinon.restore(); restaurarEnv(prev); });

  it('pasa la atribución al provisioning (con fbc armado desde fbclid) y el User-Agent', async () => {
    const s = prov();
    const res = await request(app).post('/api/signup').set('User-Agent', 'Mozilla/Test').send(body({
      utmSource: 'facebook', utmMedium: 'cpc', utmCampaign: 'c1', utmContent: 'v2', fbclid: 'AbC123', fbp: 'fb.1.1.99', metaEventId: 'ev-77',
    }));
    expect(res.status).to.equal(201);
    const arg = s.firstCall.args[0];
    expect(arg).to.include({ utmSource: 'facebook', utmMedium: 'cpc', utmCampaign: 'c1', utmContent: 'v2', fbclid: 'AbC123', metaFbp: 'fb.1.1.99', metaUa: 'Mozilla/Test' });
    expect(arg.metaFbc).to.match(/^fb\.1\.\d+\.AbC123$/);
  });

  it('campos de atribución basura no bloquean el alta', async () => {
    const s = prov();
    const res = await request(app).post('/api/signup').send(body({ utmSource: { x: 1 }, fbclid: ['a'], utmContent: 'x'.repeat(500) }));
    expect(res.status).to.equal(201);
    const arg = s.firstCall.args[0];
    expect(arg.utmSource).to.equal(undefined);
    expect(arg.fbclid).to.equal(undefined);
    expect(arg.utmContent).to.have.length(150);
  });

  it('con CAPI configurado manda CompleteRegistration con el event_id del front', async () => {
    configurar();
    prov();
    const f = sinon.stub(global, 'fetch').resolves({ ok: true, status: 200 });
    const res = await request(app).post('/api/signup').send(body({ metaEventId: 'ev-77', telefono: '3513344326' }));
    expect(res.status).to.equal(201);
    await new Promise((r) => setImmediate(r));
    const evento = JSON.parse(f.firstCall.args[1].body).data[0];
    expect(evento.event_name).to.equal('CompleteRegistration');
    expect(evento.event_id).to.equal('ev-77');
    expect(evento.user_data.em).to.deep.equal([sha('ana@pizza.com')]);
  });

  it('si Meta falla, el alta igual responde 201', async () => {
    configurar();
    prov();
    sinon.stub(global, 'fetch').rejects(new Error('sin red'));
    sinon.stub(console, 'error');
    const res = await request(app).post('/api/signup').send(body());
    expect(res.status).to.equal(201);
  });
});
