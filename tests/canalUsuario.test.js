/**
 * canalUsuario.test.js — identidad en el bot de Telegram (paso 0 del harness interno)
 *   · /api/mi-telegram: cada usuario genera su link de vinculación (un solo uso, 10 min)
 *   · webhook: /start v_<código> vincula el chat al usuario; los chats vinculados
 *     hablan con el "comercio" (punto de enchufe del harness), no reciben el link
 *   · avisos de pedidos: sólo a usuarios vinculados, staff activo, con módulo Pedidos
 */
const request = require('supertest');
const sinon = require('sinon');
const jwt = require('jsonwebtoken');

process.env.CANAL_ENC_KEY = 'a'.repeat(64);
process.env.MICROSITIO_URL = 'https://app.test.local/catalogo';

const app = require('../node');
const planService = require('../services/cliente/planService');
const canalesDb = require('../model/canales/db');
const usuariosDb = require('../model/canales/usuarios');
const waDb = require('../model/whatsaap/db');
const micrositioDb = require('../model/micrositio/db');
const telegram = require('../services/canales/telegramApi');
const cripto = require('../services/canales/cripto');
const canalesService = require('../services/canales/canalesService');
const operacionesDiariasService = require('../services/operaciones_diarias/operacionesDiariasService');
const turnLog = require('../model/harness/turnLog');

let expect;
before(async () => { ({ expect } = await import('chai')); });
afterEach(() => sinon.restore());

const BOT_TOKEN = '123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw1';
const SECRET = 'secreto-del-webhook-0123456789abcdef';

const plan = (tierCode) => ({
  clienteId: 7, clienteNombre: 'Pizzería Test', tierCode,
  features: planService.PLAN_FEATURES[tierCode], isExpired: false,
});
const userJwt = (over = {}) => jwt.sign(
  { userId: 21, cliente_id: 7, role: ['cajero'], modules: ['operaciones'], permissions: {}, tipo: 'EMP', ...over },
  process.env.JWT_SECRET, { expiresIn: '1h' },
);
const bot = (over = {}) => ({
  id: 40, cliente_id: 7, provider: 'telegram', external_id: '123456789', nombre: '@pizzeria_test_bot',
  status: 'active', config: {}, credenciales_enc: cripto.encriptar(BOT_TOKEN),
  webhook_secret_hash: cripto.sha256(SECRET), ...over,
});
const usuario = (over = {}) => ({
  vinculo_id: 9, user_id: 21, cliente_id: 7, avisos: true, nombre: 'Ana', apellido: 'Torres',
  deleted_at: null, tipo: 'EMP', modulos: ['operaciones'], ...over,
});

// ─── /api/mi-telegram ─────────────────────────────────────────────────────────
describe('Mi Telegram — vinculación de cada usuario', () => {
  beforeEach(() => { sinon.stub(planService, 'getClienteTierAndFeatures').resolves(plan('PREMIUM')); });

  it('genera un link t.me/<bot>?start=v_<32 hex> de 10 min; guarda sólo el hash', async () => {
    sinon.stub(canalesDb, 'getTelegramActivo').resolves(bot());
    const crear = sinon.stub(usuariosDb, 'crearVinculacion').resolves();
    const res = await request(app).post('/api/mi-telegram/vinculacion').set('Authorization', `Bearer ${userJwt()}`);
    expect(res.status).to.equal(201);
    const m = res.body.url.match(/^https:\/\/t\.me\/pizzeria_test_bot\?start=v_([a-f0-9]{32})$/);
    expect(m).to.not.equal(null);
    expect(res.body.expira_en).to.equal(600);
    const a = crear.firstCall.args[0];
    expect(a).to.include({ clienteId: 7, userId: 21, canalCuentaId: 40, ttlSegundos: 600 });
    expect(a.codigoHash).to.equal(cripto.sha256(m[1]));
    expect(JSON.stringify(a)).to.not.include(m[1]);
  });

  it('el usuario del link sale del JWT, no del body', async () => {
    sinon.stub(canalesDb, 'getTelegramActivo').resolves(bot());
    const crear = sinon.stub(usuariosDb, 'crearVinculacion').resolves();
    await request(app).post('/api/mi-telegram/vinculacion').set('Authorization', `Bearer ${userJwt()}`).send({ user_id: 1, userId: 1 });
    expect(crear.firstCall.args[0].userId).to.equal(21);
  });

  it('sin bot conectado → 404 SIN_BOT', async () => {
    sinon.stub(canalesDb, 'getTelegramActivo').resolves(null);
    const res = await request(app).post('/api/mi-telegram/vinculacion').set('Authorization', `Bearer ${userJwt()}`);
    expect(res.status).to.equal(404);
    expect(res.body.code).to.equal('SIN_BOT');
  });

  it('GET devuelve el bot y mi vínculo (sin chat_id)', async () => {
    sinon.stub(canalesDb, 'getTelegramActivo').resolves(bot());
    sinon.stub(usuariosDb, 'getVinculoDeUsuario').resolves({ id: 9, avisos: true, created_at: 'x', ultimo_uso_at: null });
    const res = await request(app).get('/api/mi-telegram').set('Authorization', `Bearer ${userJwt()}`);
    expect(res.status).to.equal(200);
    expect(res.body.bot).to.include({ nombre: '@pizzeria_test_bot' });
    expect(res.body.vinculo).to.include({ id: 9, avisos: true });
    expect(JSON.stringify(res.body)).to.not.match(/chat_id|credenciales/);
  });

  it('PATCH apaga mis avisos; valida el tipo', async () => {
    sinon.stub(canalesDb, 'getTelegramActivo').resolves(bot());
    const set = sinon.stub(usuariosDb, 'setAvisos').resolves({ id: 9, avisos: false });
    const bad = await request(app).patch('/api/mi-telegram').set('Authorization', `Bearer ${userJwt()}`).send({ avisos: 'no' });
    expect(bad.status).to.equal(400);
    const res = await request(app).patch('/api/mi-telegram').set('Authorization', `Bearer ${userJwt()}`).send({ avisos: false });
    expect(res.status).to.equal(200);
    expect(set.firstCall.args).to.deep.equal([7, 21, 40, false]);
  });

  it('DELETE desvincula sólo mi chat', async () => {
    sinon.stub(canalesDb, 'getTelegramActivo').resolves(bot());
    const del = sinon.stub(usuariosDb, 'desvincularUsuario').resolves(true);
    const res = await request(app).delete('/api/mi-telegram').set('Authorization', `Bearer ${userJwt()}`);
    expect(res.status).to.equal(200);
    expect(del.firstCall.args).to.deep.equal([7, 21, 40]);
  });

  it('usuario externo de la academia (profesor) → 403', async () => {
    const res = await request(app).get('/api/mi-telegram').set('Authorization', `Bearer ${userJwt({ tipo: 'PROF' })}`);
    expect(res.status).to.equal(403);
  });

  it('plan FREE → 403 PLAN_INACTIVE', async () => {
    planService.getClienteTierAndFeatures.resolves(plan('FREE'));
    const res = await request(app).get('/api/mi-telegram').set('Authorization', `Bearer ${userJwt()}`);
    expect(res.status).to.equal(403);
    expect(res.body.code).to.equal('PLAN_INACTIVE');
  });

  it('admin quita el vínculo de otro usuario; id basura → 400', async () => {
    const quitar = sinon.stub(usuariosDb, 'desvincularPorId').resolves(true);
    const admin = userJwt({ userId: 1, role: ['admin'], tipo: 'ADMIN' });
    const bad = await request(app).delete('/api/canales/vinculados/abc').set('Authorization', `Bearer ${admin}`);
    expect(bad.status).to.equal(400);
    const res = await request(app).delete('/api/canales/vinculados/9').set('Authorization', `Bearer ${admin}`);
    expect(res.status).to.equal(200);
    expect(quitar.firstCall.args).to.deep.equal([7, 9]);
  });

  it('un empleado no puede quitar vínculos de otros → 403', async () => {
    const res = await request(app).delete('/api/canales/vinculados/9').set('Authorization', `Bearer ${userJwt()}`);
    expect(res.status).to.equal(403);
  });
});

// ─── Webhook ──────────────────────────────────────────────────────────────────
describe('Bot — chats vinculados a usuarios', () => {
  const update = (texto, over = {}) => ({
    update_id: 2001,
    message: { message_id: 1, chat: { id: 555, type: 'private' }, from: { id: 555, is_bot: false, first_name: 'Ana' }, text: texto, ...over },
  });
  const hook = (body) => request(app).post('/api/canales/telegram/webhook/40')
    .set('X-Telegram-Bot-Api-Secret-Token', SECRET).send(body);

  beforeEach(() => {
    sinon.stub(canalesDb, 'getCuentaInterna').resolves(bot());
    sinon.stub(planService, 'getClienteTierAndFeatures').resolves(plan('PREMIUM'));
    sinon.stub(waDb, 'registrarMensajeEntrante').resolves(true);
    sinon.stub(turnLog, 'insertar').resolves(1); // turn_log: lo cubre harnessTurnLog.test.js
  });

  it('/start v_<código válido> vincula el chat al usuario del código', async () => {
    const codigo = 'f'.repeat(32);
    const consumir = sinon.stub(usuariosDb, 'consumirVinculacion').resolves({ cliente_id: 7, user_id: 21 });
    const vincular = sinon.stub(usuariosDb, 'vincular').resolves({ id: 9 });
    sinon.stub(usuariosDb, 'getUsuarioDelChat').resolves(usuario());
    const send = sinon.stub(telegram, 'sendMessage').resolves({});
    const res = await hook(update(`/start v_${codigo}`));
    expect(res.body.accion).to.equal('vinculado');
    expect(consumir.firstCall.args).to.deep.equal([cripto.sha256(codigo), 40]);
    expect(vincular.firstCall.args[0]).to.deep.equal({ clienteId: 7, userId: 21, canalCuentaId: 40, chatId: '555' });
    expect(send.firstCall.args[2]).to.include('Listo, Ana').and.include('te aviso acá cada pedido nuevo');
  });

  it('código usado, vencido o de otro bot → no vincula', async () => {
    sinon.stub(usuariosDb, 'consumirVinculacion').resolves(null);
    const vincular = sinon.stub(usuariosDb, 'vincular');
    sinon.stub(telegram, 'sendMessage').resolves({});
    const res = await hook(update(`/start v_${'f'.repeat(32)}`));
    expect(res.body.accion).to.equal('vinculacion_invalida');
    expect(vincular.called).to.equal(false);
  });

  it('código de otro comercio (no debería existir, igual se frena) → no vincula', async () => {
    sinon.stub(usuariosDb, 'consumirVinculacion').resolves({ cliente_id: 8, user_id: 99 });
    const vincular = sinon.stub(usuariosDb, 'vincular');
    sinon.stub(telegram, 'sendMessage').resolves({});
    const res = await hook(update(`/start v_${'f'.repeat(32)}`));
    expect(res.body.accion).to.equal('vinculacion_invalida');
    expect(vincular.called).to.equal(false);
  });

  it('el link de avisos viejo (anónimo) ya no registra nada', async () => {
    sinon.stub(usuariosDb, 'getUsuarioDelChat').resolves(null);
    sinon.stub(canalesDb, 'findOrCreateConversacion').resolves({ id: 88, phone_e164: null });
    const send = sinon.stub(telegram, 'sendMessage').resolves({});
    const res = await hook(update(`/start avisos_${'c'.repeat(24)}`));
    expect(res.body.accion).to.equal('link_enviado'); // lo trata como cliente
    expect(send.firstCall.args[3].reply_markup).to.exist;
  });

  it('usuario vinculado escribe → respuesta interna (harness), no el link de pedidos', async () => {
    sinon.stub(usuariosDb, 'getUsuarioDelChat').resolves(usuario());
    const uso = sinon.stub(usuariosDb, 'tocarUso').resolves();
    const conv = sinon.stub(canalesDb, 'findOrCreateConversacion');
    const send = sinon.stub(telegram, 'sendMessage').resolves({});
    const res = await hook(update('cuánto vendí hoy'));
    expect(res.body).to.deep.equal({ ok: true, accion: 'interno' });
    expect(uso.calledOnce).to.equal(true);
    expect(conv.called).to.equal(false);
    expect(send.firstCall.args[2]).to.include('vinculado a tu usuario de Pizzería Test');
  });

  it('usuario vinculado manda /pedir → recibe el link como un cliente', async () => {
    sinon.stub(usuariosDb, 'getUsuarioDelChat').resolves(usuario());
    sinon.stub(usuariosDb, 'tocarUso').resolves();
    sinon.stub(canalesDb, 'findOrCreateConversacion').resolves({ id: 88, phone_e164: null });
    const send = sinon.stub(telegram, 'sendMessage').resolves({});
    const res = await hook(update('/pedir'));
    expect(res.body.accion).to.equal('link_enviado');
    expect(send.firstCall.args[3].reply_markup.inline_keyboard[0][0].url).to.match(/catalogo\?c=/);
  });

  it('/desvincular corta el vínculo', async () => {
    sinon.stub(usuariosDb, 'getUsuarioDelChat').resolves(usuario());
    sinon.stub(usuariosDb, 'tocarUso').resolves();
    const del = sinon.stub(usuariosDb, 'desvincularPorId').resolves(true);
    sinon.stub(telegram, 'sendMessage').resolves({});
    const res = await hook(update('/desvincular'));
    expect(res.body.accion).to.equal('desvinculado');
    expect(del.firstCall.args).to.deep.equal([7, 9]);
  });

  it('usuario dado de baja → se borra el vínculo y el chat se trata como cliente', async () => {
    sinon.stub(usuariosDb, 'getUsuarioDelChat').resolves(usuario({ deleted_at: new Date() }));
    const del = sinon.stub(usuariosDb, 'desvincularPorId').resolves(true);
    sinon.stub(canalesDb, 'findOrCreateConversacion').resolves({ id: 88, phone_e164: null });
    sinon.stub(telegram, 'sendMessage').resolves({});
    const res = await hook(update('hola'));
    expect(del.firstCall.args).to.deep.equal([7, 9]);
    expect(res.body.accion).to.equal('link_enviado');
  });

  it('usuario que pasó a externo (alumno) → también pierde el vínculo', async () => {
    sinon.stub(usuariosDb, 'getUsuarioDelChat').resolves(usuario({ tipo: 'ALU' }));
    const del = sinon.stub(usuariosDb, 'desvincularPorId').resolves(true);
    sinon.stub(canalesDb, 'findOrCreateConversacion').resolves({ id: 88, phone_e164: null });
    sinon.stub(telegram, 'sendMessage').resolves({});
    await hook(update('hola'));
    expect(del.calledOnce).to.equal(true);
  });
});

// ─── Avisos ───────────────────────────────────────────────────────────────────
describe('Avisos de pedido nuevo (por usuario)', () => {
  it('manda a cada destinatario con el token de su bot; desencripta una vez por bot', async () => {
    sinon.stub(usuariosDb, 'getDestinatariosAvisos').resolves([
      { chat_id: '555', canal_cuenta_id: 40, credenciales_enc: cripto.encriptar(BOT_TOKEN) },
      { chat_id: '777', canal_cuenta_id: 40, credenciales_enc: cripto.encriptar(BOT_TOKEN) },
    ]);
    const des = sinon.spy(cripto, 'desencriptar');
    const send = sinon.stub(telegram, 'sendMessage').resolves({});
    const enviar = await canalesService.prepararAvisos(7, {
      comandaNro: 12, total: 17000, nombre: 'Ana', tipoEntrega: 'delivery', direccion: 'Belgrano 123',
      telefono: '3515551234', canal: 'link', observaciones: 'timbre 2',
      items: [{ cantidad: 2, nombre: 'Muzza', observaciones: '' }],
    });
    usuariosDb.getDestinatariosAvisos.restore();
    expect(await enviar()).to.equal(2);
    expect(des.callCount).to.equal(1);
    expect(send.firstCall.args[0]).to.equal(BOT_TOKEN);
    expect(send.firstCall.args[2]).to.include('#12').and.include('$17.000').and.include('2 × Muzza').and.include('Delivery a Belgrano 123');
    expect(send.secondCall.args[1]).to.equal('777');
  });

  it('sin destinatarios no manda nada', async () => {
    sinon.stub(usuariosDb, 'getDestinatariosAvisos').resolves([]);
    const send = sinon.stub(telegram, 'sendMessage');
    const enviar = await canalesService.prepararAvisos(7, { total: 1, nombre: 'x', tipoEntrega: 'pickup', items: [] });
    expect(await enviar()).to.equal(0);
    expect(send.called).to.equal(false);
  });

  it('pedido creado → avisa después de responder', async () => {
    sinon.stub(canalesDb, 'getCuentaInterna').resolves({ id: 30, cliente_id: 7, provider: 'link', status: 'active' });
    sinon.stub(planService, 'getClienteTierAndFeatures').resolves(plan('PREMIUM'));
    sinon.stub(micrositioDb, 'getProductosPorIds').resolves([{ id: 10, nombre: 'Muzza', precio_unitario: '8500.00' }]);
    sinon.stub(micrositioDb, 'getMediosPago').resolves([{ id: 2, descripcion: 'Débito', codigo: 'DEB' }]);
    sinon.stub(micrositioDb, 'getCajaAbierta').resolves({ id: 300, sucursal_id: 4, usuario_apertura_id: 21 });
    sinon.stub(micrositioDb, 'getComandaNro').resolves(5);
    sinon.stub(operacionesDiariasService, 'crearPedido').resolves(777);
    sinon.stub(usuariosDb, 'getDestinatariosAvisos').resolves([
      { chat_id: '555', canal_cuenta_id: 40, credenciales_enc: cripto.encriptar(BOT_TOKEN) },
    ]);
    const send = sinon.stub(telegram, 'sendMessage').resolves({});
    const token = jwt.sign({ clienteId: 7, canal: 'link', canalCuentaId: 30 }, process.env.HANDOFF_JWT_SECRET,
      { issuer: 'orders-api', audience: 'pwa', expiresIn: 3600 });
    const res = await request(app).post('/api/micrositio/pedidos').set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'Ana', tipo_entrega: 'pickup', medio_pago_id: 2, telefono: '3515551234', items: [{ producto_id: 10, cantidad: 2 }] });
    expect(res.status).to.equal(201);
    await new Promise((r) => setImmediate(r));
    expect(send.calledOnce).to.equal(true);
    expect(send.firstCall.args[2]).to.include('#5').and.include('Pedido nuevo');
  });
});
