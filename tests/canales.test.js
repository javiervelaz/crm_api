/**
 * canales.test.js — capa de canales del micrositio
 *   C0: cripto, slug, gating por canal, WhatsApp apagado por flag
 *   C1: link público (todos los planes, límite mensual, teléfono del form)
 *   C2: Telegram (alta con token de @BotFather, webhook con secret)
 *   (los avisos y la vinculación por usuario están en tests/canalUsuario.test.js)
 */
const request = require('supertest');
const sinon = require('sinon');
const jwt = require('jsonwebtoken');

process.env.CANAL_ENC_KEY = 'a'.repeat(64);
process.env.PUBLIC_API_URL = 'https://api.test.local';
process.env.PUBLIC_APP_URL = 'https://app.test.local';
process.env.MICROSITIO_URL = 'https://app.test.local/catalogo';

const app = require('../node');
const planService = require('../services/cliente/planService');
const canalesDb = require('../model/canales/db');
const usuariosDb = require('../model/canales/usuarios');
const waDb = require('../model/whatsaap/db');
const micrositioDb = require('../model/micrositio/db');
const telegram = require('../services/canales/telegramApi');
const cripto = require('../services/canales/cripto');
const { generarSlug, SLUG_RE } = require('../services/canales/slug');
const canalesService = require('../services/canales/canalesService');
const operacionesDiariasService = require('../services/operaciones_diarias/operacionesDiariasService');

let expect;
before(async () => { ({ expect } = await import('chai')); });
afterEach(() => sinon.restore());

const BOT_TOKEN = '123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw1';
const SECRET = 'secreto-del-webhook-0123456789abcdef';

const plan = (tierCode, { expired = false } = {}) => ({
  clienteId: 7, clienteNombre: 'Pizzería Test', tierCode,
  features: planService.PLAN_FEATURES[tierCode], isExpired: expired,
});
const userJwt = (over = {}) => jwt.sign(
  { userId: 'u-1', cliente_id: 7, role: ['admin'], modules: [], permissions: {}, ...over },
  process.env.JWT_SECRET, { expiresIn: '1h' },
);
const handoff = (payload = {}) => jwt.sign(
  { clienteId: 7, canal: 'link', canalCuentaId: 30, ...payload },
  process.env.HANDOFF_JWT_SECRET, { issuer: 'orders-api', audience: 'pwa', expiresIn: 3600 },
);
const cuentaTelegram = (over = {}) => ({
  id: 40, cliente_id: 7, provider: 'telegram', external_id: '123456789', nombre: '@pizzeria_test_bot',
  status: 'active', config: {},
  credenciales_enc: cripto.encriptar(BOT_TOKEN), webhook_secret_hash: cripto.sha256(SECRET), ...over,
});
const cuentaLink = (over = {}) => ({ id: 30, cliente_id: 7, provider: 'link', external_id: 'pizzeria-test-a1b2c3', nombre: 'pizzeria-test-a1b2c3', status: 'active', config: {}, ...over });

// ═══ C0 ══════════════════════════════════════════════════════════════════
describe('C0 — cripto y slug', () => {
  it('encripta y desencripta; el texto plano no aparece', () => {
    const enc = cripto.encriptar(BOT_TOKEN);
    expect(enc).to.match(/^v1\./);
    expect(enc).to.not.include('AAHdq');
    expect(cripto.desencriptar(enc)).to.equal(BOT_TOKEN);
  });

  it('un cifrado alterado no desencripta', () => {
    const [v, iv, tag, enc] = cripto.encriptar('hola').split('.');
    const roto = [v, iv, tag, Buffer.from('chau').toString('base64') + enc].join('.');
    expect(() => cripto.desencriptar(roto)).to.throw();
  });

  it('sin CANAL_ENC_KEY → 503 CANAL_NO_CONFIGURADO', () => {
    const prev = process.env.CANAL_ENC_KEY;
    delete process.env.CANAL_ENC_KEY;
    try {
      cripto.encriptar('x');
      throw new Error('no lanzó');
    } catch (err) {
      expect(err.status).to.equal(503);
      expect(err.code).to.equal('CANAL_NO_CONFIGURADO');
    } finally { process.env.CANAL_ENC_KEY = prev; }
  });

  it('slug legible + sufijo aleatorio, sin tildes ni reservados', () => {
    const s = generarSlug('Pizzería Doña Rosa');
    expect(s).to.match(/^pizzeria-dona-rosa-[a-f0-9]{6}$/);
    expect(SLUG_RE.test(s)).to.equal(true);
    expect(generarSlug('API')).to.match(/^pedidos-[a-f0-9]{6}$/);
    expect(generarSlug('Pizzería Doña Rosa')).to.not.equal(s);
  });
});

describe('C0 — gating del micrositio por canal', () => {
  it('link en plan FREE → OK (pedidos online en todos los planes)', async () => {
    sinon.stub(canalesDb, 'getCuentaInterna').resolves(cuentaLink());
    sinon.stub(planService, 'getClienteTierAndFeatures').resolves(plan('FREE'));
    const res = await request(app).get('/api/micrositio/sesion').set('Authorization', `Bearer ${handoff()}`);
    expect(res.status).to.equal(200);
    expect(res.body).to.include({ canal: 'link', pideTelefono: true, comercio: 'Pizzería Test' });
  });

  it('telegram en plan FREE → 403 PLAN_INACTIVE', async () => {
    sinon.stub(canalesDb, 'getCuentaInterna').resolves(cuentaTelegram());
    sinon.stub(planService, 'getClienteTierAndFeatures').resolves(plan('FREE'));
    const res = await request(app).get('/api/micrositio/sesion')
      .set('Authorization', `Bearer ${handoff({ canal: 'telegram', canalCuentaId: 40 })}`);
    expect(res.status).to.equal(403);
    expect(res.body.code).to.equal('PLAN_INACTIVE');
  });

  it('link desactivado → 403 CANAL_INACTIVO aunque el token no venció', async () => {
    sinon.stub(canalesDb, 'getCuentaInterna').resolves(cuentaLink({ status: 'disconnected' }));
    sinon.stub(planService, 'getClienteTierAndFeatures').resolves(plan('PREMIUM'));
    const res = await request(app).get('/api/micrositio/sesion').set('Authorization', `Bearer ${handoff()}`);
    expect(res.status).to.equal(403);
    expect(res.body.code).to.equal('CANAL_INACTIVO');
  });

  it('cuenta de canal de OTRO comercio en el token → 403', async () => {
    sinon.stub(canalesDb, 'getCuentaInterna').resolves(cuentaLink({ cliente_id: 8 }));
    sinon.stub(planService, 'getClienteTierAndFeatures').resolves(plan('PREMIUM'));
    const res = await request(app).get('/api/micrositio/sesion').set('Authorization', `Bearer ${handoff()}`);
    expect(res.status).to.equal(403);
  });

  it('WhatsApp con CANAL_WHATSAPP_ENABLED apagado → 403 CANAL_INACTIVO', async () => {
    const prev = process.env.CANAL_WHATSAPP_ENABLED;
    process.env.CANAL_WHATSAPP_ENABLED = 'false';
    sinon.stub(planService, 'getClienteTierAndFeatures').resolves(plan('PREMIUM'));
    const res = await request(app).get('/api/micrositio/sesion')
      .set('Authorization', `Bearer ${handoff({ canal: 'whatsapp', canalCuentaId: null })}`);
    process.env.CANAL_WHATSAPP_ENABLED = prev;
    expect(res.status).to.equal(403);
    expect(res.body.code).to.equal('CANAL_INACTIVO');
  });

  it('n8n con WhatsApp apagado → enviar:false CANAL_DESHABILITADO, sin token', async () => {
    const prev = process.env.CANAL_WHATSAPP_ENABLED;
    process.env.CANAL_WHATSAPP_ENABLED = 'false';
    sinon.stub(waDb, 'getAccountByPhoneId').resolves({ id: 1, cliente_id: 7, wa_phone_id: '267462816451428', status: 'active' });
    const res = await request(app).post('/api/internal/whatsapp/handoff/sign')
      .set('x-internal-token', process.env.N8N_INTERNAL_TOKEN)
      .send({ wa_phone_id: '267462816451428', telefono: '5493511234567' });
    process.env.CANAL_WHATSAPP_ENABLED = prev;
    expect(res.body).to.deep.equal({ enviar: false, motivo: 'CANAL_DESHABILITADO' });
  });
});

// ═══ C1 ══════════════════════════════════════════════════════════════════
describe('C1 — link público', () => {
  it('POST /api/canales/link en FREE crea el link; la respuesta trae la URL pública', async () => {
    sinon.stub(planService, 'getClienteTierAndFeatures').resolves(plan('FREE'));
    sinon.stub(canalesDb, 'getLinkDelCliente').resolves(null);
    const up = sinon.stub(canalesDb, 'upsertCuenta').callsFake(async (a) => cuentaLink({ external_id: a.externalId, nombre: a.externalId }));
    const res = await request(app).post('/api/canales/link').set('Authorization', `Bearer ${userJwt()}`);
    expect(res.status).to.equal(201);
    expect(up.firstCall.args[0]).to.include({ clienteId: 7, provider: 'link' });
    expect(res.body.url).to.match(/^https:\/\/app\.test\.local\/p\/pizzeria-test-[a-f0-9]{6}$/);
  });

  it('el link existente se reusa (no se genera otro)', async () => {
    sinon.stub(planService, 'getClienteTierAndFeatures').resolves(plan('FREE'));
    sinon.stub(canalesDb, 'getLinkDelCliente').resolves(cuentaLink());
    const up = sinon.stub(canalesDb, 'upsertCuenta');
    const res = await request(app).post('/api/canales/link').set('Authorization', `Bearer ${userJwt()}`);
    expect(res.body.slug).to.equal('pizzeria-test-a1b2c3');
    expect(up.called).to.equal(false);
  });

  it('sesión pública: slug con basura → 404 sin tocar la DB', async () => {
    const s = sinon.stub(canalesDb, 'getCuentaPorExternal');
    const res = await request(app).post("/api/publico/pedidos/x' OR 1=1/sesion");
    expect(res.status).to.equal(404);
    expect(s.called).to.equal(false);
  });

  it('sesión pública: link desactivado → 404', async () => {
    sinon.stub(canalesDb, 'getCuentaPorExternal').resolves(cuentaLink({ status: 'disconnected' }));
    const res = await request(app).post('/api/publico/pedidos/pizzeria-test-a1b2c3/sesion');
    expect(res.status).to.equal(404);
  });

  it('sesión pública OK → token canal link del comercio dueño del slug', async () => {
    sinon.stub(canalesDb, 'getCuentaPorExternal').resolves(cuentaLink());
    sinon.stub(planService, 'getClienteTierAndFeatures').resolves(plan('FREE'));
    const res = await request(app).post('/api/publico/pedidos/pizzeria-test-a1b2c3/sesion').send({ cliente_id: 99 });
    expect(res.status).to.equal(200);
    const p = jwt.verify(res.body.token, process.env.HANDOFF_JWT_SECRET, { issuer: 'orders-api', audience: 'pwa' });
    expect(p).to.include({ clienteId: 7, canal: 'link', canalCuentaId: 30 });
    expect(res.body.comercio).to.equal('Pizzería Test');
  });

  it('sesión pública con plan vencido → 403 PLAN_INACTIVE', async () => {
    sinon.stub(canalesDb, 'getCuentaPorExternal').resolves(cuentaLink());
    sinon.stub(planService, 'getClienteTierAndFeatures').resolves(plan('PREMIUM', { expired: true }));
    const res = await request(app).post('/api/publico/pedidos/pizzeria-test-a1b2c3/sesion');
    expect(res.status).to.equal(403);
  });

  describe('pedido por el link', () => {
    const body = (over = {}) => ({
      nombre: 'Ana', tipo_entrega: 'pickup', medio_pago_id: 2, telefono: '351 555-1234',
      items: [{ producto_id: 10, cantidad: 1 }], ...over,
    });
    const setup = (tier = 'FREE', pedidosDelMes = 0) => {
      sinon.stub(canalesDb, 'getCuentaInterna').resolves(cuentaLink());
      sinon.stub(planService, 'getClienteTierAndFeatures').resolves(plan(tier));
      sinon.stub(micrositioDb, 'getProductosPorIds').resolves([{ id: 10, nombre: 'Muzza', precio_unitario: '8500.00' }]);
      sinon.stub(micrositioDb, 'getMediosPago').resolves([{ id: 2, descripcion: 'Débito', codigo: 'DEB' }]);
      sinon.stub(micrositioDb, 'contarPedidosDelMes').resolves(pedidosDelMes);
      sinon.stub(micrositioDb, 'getCajaAbierta').resolves({ id: 300, sucursal_id: 4, usuario_apertura_id: 21 });
      sinon.stub(micrositioDb, 'getComandaNro').resolves(5);
      sinon.stub(usuariosDb, 'getDestinatariosAvisos').resolves([]);
      return sinon.stub(operacionesDiariasService, 'crearPedido').resolves(777);
    };

    it('sin teléfono en el token: lo toma del form (sólo dígitos)', async () => {
      const crear = setup();
      const res = await request(app).post('/api/micrositio/pedidos').set('Authorization', `Bearer ${handoff()}`).send(body());
      expect(res.status).to.equal(201);
      expect(crear.firstCall.args[0]).to.include({ cliente_telefono: '3515551234', cliente_id: 7 });
      expect(crear.firstCall.args[0].pedido_obs).to.equal('Retiro en local - Pedido online');
    });

    it('sin teléfono en el token ni en el form → 400', async () => {
      const crear = setup();
      const res = await request(app).post('/api/micrositio/pedidos').set('Authorization', `Bearer ${handoff()}`)
        .send(body({ telefono: '' }));
      expect(res.status).to.equal(400);
      expect(crear.called).to.equal(false);
    });

    it('FREE con 50 pedidos en el mes → 409 LIMITE_PEDIDOS', async () => {
      const crear = setup('FREE', 50);
      const res = await request(app).post('/api/micrositio/pedidos').set('Authorization', `Bearer ${handoff()}`).send(body());
      expect(res.status).to.equal(409);
      expect(res.body.code).to.equal('LIMITE_PEDIDOS');
      expect(crear.called).to.equal(false);
    });

    it('PREMIUM no cuenta pedidos (sin límite)', async () => {
      setup('PREMIUM', 9999);
      const res = await request(app).post('/api/micrositio/pedidos').set('Authorization', `Bearer ${handoff()}`).send(body());
      expect(res.status).to.equal(201);
      expect(micrositioDb.contarPedidosDelMes.called).to.equal(false);
    });
  });
});

// ═══ C2 ══════════════════════════════════════════════════════════════════
describe('C2 — Telegram: alta', () => {
  it('token con formato inválido → 400 sin llamar a Telegram', async () => {
    sinon.stub(planService, 'getClienteTierAndFeatures').resolves(plan('PREMIUM'));
    const me = sinon.stub(telegram, 'getMe');
    const res = await request(app).post('/api/canales/telegram').set('Authorization', `Bearer ${userJwt()}`).send({ token: 'cualquiera' });
    expect(res.status).to.equal(400);
    expect(me.called).to.equal(false);
  });

  it('plan FREE → 403 PLAN_INACTIVE', async () => {
    sinon.stub(planService, 'getClienteTierAndFeatures').resolves(plan('FREE'));
    const res = await request(app).post('/api/canales/telegram').set('Authorization', `Bearer ${userJwt()}`).send({ token: BOT_TOKEN });
    expect(res.status).to.equal(403);
  });

  it('alta OK: guarda el token encriptado, registra el webhook con secret y nunca devuelve el token', async () => {
    sinon.stub(planService, 'getClienteTierAndFeatures').resolves(plan('CUSTOM'));
    sinon.stub(telegram, 'getMe').resolves({ id: 123456789, is_bot: true, username: 'pizzeria_test_bot' });
    const hook = sinon.stub(telegram, 'setWebhook').resolves(true);
    const up = sinon.stub(canalesDb, 'upsertCuenta').callsFake(async (a) => cuentaTelegram({ config: a.config }));
    const res = await request(app).post('/api/canales/telegram').set('Authorization', `Bearer ${userJwt()}`).send({ token: BOT_TOKEN });
    expect(res.status).to.equal(201);
    const a = up.firstCall.args[0];
    expect(a).to.include({ clienteId: 7, provider: 'telegram', externalId: '123456789', nombre: '@pizzeria_test_bot' });
    expect(cripto.desencriptar(a.credencialesEnc)).to.equal(BOT_TOKEN);
    const { url, secretToken } = hook.firstCall.args[1];
    expect(url).to.equal('https://api.test.local/api/canales/telegram/webhook/40');
    expect(cripto.sha256(secretToken)).to.equal(a.webhookSecretHash);
    expect(JSON.stringify(res.body)).to.not.include('AAHdq');
    expect(res.body).to.not.have.property('url_avisos');
  });

  it('bot ya conectado a otro comercio → 409', async () => {
    sinon.stub(planService, 'getClienteTierAndFeatures').resolves(plan('PREMIUM'));
    sinon.stub(telegram, 'getMe').resolves({ id: 123456789, is_bot: true, username: 'otro_bot' });
    sinon.stub(canalesDb, 'upsertCuenta').resolves(null);
    const res = await request(app).post('/api/canales/telegram').set('Authorization', `Bearer ${userJwt()}`).send({ token: BOT_TOKEN });
    expect(res.status).to.equal(409);
    expect(res.body.code).to.equal('TELEGRAM_BOT_EN_USO');
  });

  it('si setWebhook falla la cuenta queda desconectada', async () => {
    sinon.stub(planService, 'getClienteTierAndFeatures').resolves(plan('PREMIUM'));
    sinon.stub(telegram, 'getMe').resolves({ id: 123456789, is_bot: true, username: 'pizzeria_test_bot' });
    sinon.stub(canalesDb, 'upsertCuenta').resolves(cuentaTelegram());
    const err = new Error('Bad webhook'); err.status = 502;
    sinon.stub(telegram, 'setWebhook').rejects(err);
    const st = sinon.stub(canalesDb, 'setStatus').resolves(cuentaTelegram({ status: 'disconnected' }));
    const res = await request(app).post('/api/canales/telegram').set('Authorization', `Bearer ${userJwt()}`).send({ token: BOT_TOKEN });
    expect(res.status).to.equal(502);
    expect(st.firstCall.args).to.deep.equal([7, 40, 'disconnected']);
  });

  it('un empleado (sin rol admin) no puede conectar ni ver canales → 403', async () => {
    const res = await request(app).get('/api/canales').set('Authorization', `Bearer ${userJwt({ role: ['empleado'] })}`);
    expect(res.status).to.equal(403);
  });

  it('GET /api/canales no expone credenciales ni hashes', async () => {
    sinon.stub(canalesDb, 'listarPorCliente').resolves([cuentaLink(), cuentaTelegram()]);
    sinon.stub(waDb, 'getWhatsappByClienteId').resolves([]);
    sinon.stub(usuariosDb, 'listarVinculados').resolves([
      { id: 3, user_id: 21, nombre: 'Ana Torres', avisos: true, created_at: 'x', ultimo_uso_at: null, acceso_pedidos: true },
      { id: 4, user_id: 22, nombre: 'Lu Stock', avisos: true, created_at: 'y', ultimo_uso_at: null, acceso_pedidos: false },
    ]);
    const res = await request(app).get('/api/canales').set('Authorization', `Bearer ${userJwt()}`);
    expect(res.status).to.equal(200);
    const txt = JSON.stringify(res.body);
    expect(txt).to.not.match(/credenciales|webhook_secret|v1\./);
    expect(res.body.telegram[0]).to.include({ nombre: '@pizzeria_test_bot', url_bot: 'https://t.me/pizzeria_test_bot' });
    expect(res.body.whatsapp).to.have.property('habilitado');
    expect(res.body.telegram[0].vinculados).to.deep.equal([
      { id: 3, user_id: 21, nombre: 'Ana Torres', avisos: true, created_at: 'x', ultimo_uso_at: null, recibe_avisos: true },
      { id: 4, user_id: 22, nombre: 'Lu Stock', avisos: true, created_at: 'y', ultimo_uso_at: null, recibe_avisos: false },
    ]);
    expect(txt).to.not.include('chat_id');
  });
});

describe('C2 — Telegram: webhook', () => {
  const update = (over = {}) => ({
    update_id: 1001,
    message: { message_id: 1, chat: { id: 555, type: 'private' }, from: { id: 555, is_bot: false, first_name: 'Ana' }, text: 'hola', ...over },
  });
  const hook = (body, secret = SECRET) => request(app).post('/api/canales/telegram/webhook/40')
    .set('X-Telegram-Bot-Api-Secret-Token', secret).send(body);
  // Por defecto el chat es de un cliente final (no vinculado a un usuario)
  beforeEach(() => { sinon.stub(usuariosDb, 'getUsuarioDelChat').resolves(null); });

  it('secret incorrecto → 401 sin procesar', async () => {
    sinon.stub(canalesDb, 'getCuentaInterna').resolves(cuentaTelegram());
    const send = sinon.stub(telegram, 'sendMessage');
    const res = await hook(update(), 'otro');
    expect(res.status).to.equal(401);
    expect(send.called).to.equal(false);
  });

  it('cuenta inexistente → 404', async () => {
    sinon.stub(canalesDb, 'getCuentaInterna').resolves(null);
    const res = await hook(update());
    expect(res.status).to.equal(404);
  });

  it('mensaje privado → responde con botón al micrositio; token canal telegram del comercio', async () => {
    sinon.stub(canalesDb, 'getCuentaInterna').resolves(cuentaTelegram());
    sinon.stub(planService, 'getClienteTierAndFeatures').resolves(plan('PREMIUM'));
    sinon.stub(waDb, 'registrarMensajeEntrante').resolves(true);
    const conv = sinon.stub(canalesDb, 'findOrCreateConversacion').resolves({ id: 88, phone_e164: null });
    const send = sinon.stub(telegram, 'sendMessage').resolves({});
    const res = await hook(update());
    expect(res.body).to.deep.equal({ ok: true, accion: 'link_enviado' });
    expect(conv.firstCall.args[0]).to.include({ clienteId: 7, provider: 'telegram', canalCuentaId: 40, externalUserId: '555' });
    const [token, chatId, texto, extra] = send.firstCall.args;
    expect(token).to.equal(BOT_TOKEN);
    expect(chatId).to.equal(555);
    expect(texto).to.include('Ana').and.include('Pizzería Test');
    const url = extra.reply_markup.inline_keyboard[0][0].url;
    const t = decodeURIComponent(url.split('?c=')[1]);
    const p = jwt.verify(t, process.env.HANDOFF_JWT_SECRET, { issuer: 'orders-api', audience: 'pwa' });
    expect(p).to.include({ clienteId: 7, canal: 'telegram', canalCuentaId: 40, conversationId: 88, externalUserId: '555' });
    expect(p.userPhoneE164).to.equal(null);
  });

  it('grupo → ignorado', async () => {
    sinon.stub(canalesDb, 'getCuentaInterna').resolves(cuentaTelegram());
    sinon.stub(planService, 'getClienteTierAndFeatures').resolves(plan('PREMIUM'));
    const send = sinon.stub(telegram, 'sendMessage');
    const res = await hook(update({ chat: { id: -100, type: 'group' } }));
    expect(res.body.accion).to.equal('ignorado');
    expect(send.called).to.equal(false);
  });

  it('reintento del mismo update_id → duplicado', async () => {
    sinon.stub(canalesDb, 'getCuentaInterna').resolves(cuentaTelegram());
    sinon.stub(planService, 'getClienteTierAndFeatures').resolves(plan('PREMIUM'));
    const reg = sinon.stub(waDb, 'registrarMensajeEntrante').resolves(false);
    const send = sinon.stub(telegram, 'sendMessage');
    const res = await hook(update());
    expect(res.body.accion).to.equal('duplicado');
    expect(reg.firstCall.args[0]).to.equal('tg:40:1001');
    expect(send.called).to.equal(false);
  });

  it('comercio que bajó a FREE → no contesta', async () => {
    sinon.stub(canalesDb, 'getCuentaInterna').resolves(cuentaTelegram());
    sinon.stub(planService, 'getClienteTierAndFeatures').resolves(plan('FREE'));
    const send = sinon.stub(telegram, 'sendMessage');
    const res = await hook(update());
    expect(res.body.accion).to.equal('plan_inactivo');
    expect(send.called).to.equal(false);
  });

  it('el contacto compartido por el propio usuario se guarda como teléfono', async () => {
    sinon.stub(canalesDb, 'getCuentaInterna').resolves(cuentaTelegram());
    sinon.stub(planService, 'getClienteTierAndFeatures').resolves(plan('PREMIUM'));
    sinon.stub(waDb, 'registrarMensajeEntrante').resolves(true);
    const conv = sinon.stub(canalesDb, 'findOrCreateConversacion').resolves({ id: 88, phone_e164: '5493515551234' });
    sinon.stub(telegram, 'sendMessage').resolves({});
    await hook(update({ text: undefined, contact: { user_id: 555, phone_number: '+54 9 351 555-1234' } }));
    expect(conv.firstCall.args[0].telefono).to.equal('5493515551234');
  });
});
