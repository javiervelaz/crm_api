/**
 * harnessTurnLog.test.js — paso 4 del harness interno
 *   · turn_log: una fila por turno, siempre; nunca tira el turno
 *   · runWithTenant: unidad de trabajo de un solo comercio fuera de HTTP
 *   · el bot de Telegram registra cada mensaje de un usuario vinculado
 */
const request = require('supertest');
const sinon = require('sinon');
const pg = require('pg');

process.env.CANAL_ENC_KEY = process.env.CANAL_ENC_KEY || 'a'.repeat(64);

const app = require('../node');
const pool = require('../pool');
const { getStore } = require('../tenantContext');
const { runWithTenant } = require('../middleware/tenantConnection');
const usage = require('../services/harness/core/usage');
const turnLog = require('../model/harness/turnLog');
const planService = require('../services/cliente/planService');
const canalesDb = require('../model/canales/db');
const usuariosDb = require('../model/canales/usuarios');
const waDb = require('../model/whatsaap/db');
const telegram = require('../services/canales/telegramApi');
const cripto = require('../services/canales/cripto');
const mensajesInternos = require('../services/canales/mensajesInternos');
const harness = require('../services/harness/core/manejarTurno');

let expect;
before(async () => { ({ expect } = await import('chai')); });
afterEach(() => sinon.restore());

const turnoBase = (over = {}) => ({
  clienteId: 7, userId: 21, vertical: 'interno', canal: 'telegram', stage: 'fijo', intent: 'ayuda', ...over,
});

describe('usage.registrarTurno', () => {
  it('turno sin modelo: model NULL, tokens 0, ok true', async () => {
    const ins = sinon.stub(turnLog, 'insertar').resolves(5);
    const id = await usage.registrarTurno(turnoBase({ texto: 'cuánto vendí hoy', msgsOut: 1, latencyMs: 12.4 }));
    expect(id).to.equal(5);
    const fila = ins.firstCall.args[0];
    expect(fila).to.include({
      cliente_id: 7, user_id: 21, vertical: 'interno', canal: 'telegram', intent: 'ayuda', stage: 'fijo',
      ok: true, gasto: false, model: null, input_tokens: 0, output_tokens: 0, cache_write_tokens: 0,
      msgs_out: 1, latency_ms: 12, texto: 'cuánto vendí hoy',
    });
  });

  it('el turno vale entero: suma los usos parciales (clasificar + ejecutar)', async () => {
    const ins = sinon.stub(turnLog, 'insertar').resolves(6);
    await usage.registrarTurno(turnoBase({
      gasto: true,
      uso: usage.acumular(
        { input_tokens: 3200, output_tokens: 8, cache_write_tokens: 3000, model: 'claude-haiku-5-5' },
        { input_tokens: 400, output_tokens: 120, cached_tokens: 3000 },
      ),
    }));
    expect(ins.firstCall.args[0]).to.include({
      input_tokens: 3600, output_tokens: 128, cached_tokens: 3000, cache_write_tokens: 3000,
      model: 'claude-haiku-5-5', gasto: true,
    });
  });

  it('recorta el texto a 500 y el error a 300', async () => {
    const ins = sinon.stub(turnLog, 'insertar').resolves(7);
    await usage.registrarTurno(turnoBase({ texto: 'x'.repeat(900), ok: false, stage: 'error', error: 'e'.repeat(900) }));
    expect(ins.firstCall.args[0].texto).to.have.length(500);
    expect(ins.firstCall.args[0].error).to.have.length(300);
    expect(ins.firstCall.args[0].ok).to.equal(false);
  });

  it('nunca lanza: sin cliente_id, vertical inválida o la DB caída → null', async () => {
    const err = sinon.stub(console, 'error');
    const ins = sinon.stub(turnLog, 'insertar').rejects(new Error('DB caída'));
    expect(await usage.registrarTurno(turnoBase({ clienteId: null }))).to.equal(null);
    expect(await usage.registrarTurno(turnoBase({ vertical: 'otra' }))).to.equal(null);
    expect(await usage.registrarTurno(turnoBase())).to.equal(null);
    expect(ins.callCount).to.equal(1); // las dos primeras ni llegan a la DB
    expect(err.callCount).to.equal(3);
  });

  it('turnLog.insertar va por fuera de la transacción del tenant (queryDirecta)', async () => {
    const directa = sinon.stub(pool, 'queryDirecta').resolves({ rows: [{ id: 9 }] });
    const enTx = sinon.stub(pool, 'query');
    const id = await turnLog.insertar(usage.aFila(turnoBase()));
    expect(id).to.equal(9);
    expect(enTx.called).to.equal(false);
    expect(directa.firstCall.args[0]).to.match(/^INSERT INTO turn_log/);
    expect(directa.firstCall.args[1]).to.have.length(turnLog.COLUMNAS.length);
  });
});

describe('runWithTenant', () => {
  const fakeClient = () => ({ query: sinon.stub().resolves({ rows: [] }), release: sinon.stub() });

  it('abre una tx con app.cliente_id y hace COMMIT si fn resuelve', async () => {
    const c = fakeClient();
    sinon.stub(pg.Pool.prototype, 'connect').resolves(c);
    const r = await runWithTenant(7, async () => {
      expect(getStore().clienteId).to.equal(7);
      await pool.query('SELECT 1');
      return 'ok';
    });
    expect(r).to.equal('ok');
    const sqls = c.query.getCalls().map((x) => x.args[0]);
    expect(sqls[0]).to.equal('BEGIN');
    expect(c.query.secondCall.args[1]).to.deep.equal(['7']);
    expect(sqls.at(-1)).to.equal('COMMIT');
    expect(c.release.calledOnce).to.equal(true);
  });

  it('ROLLBACK y relanza si fn falla', async () => {
    const c = fakeClient();
    sinon.stub(pg.Pool.prototype, 'connect').resolves(c);
    let atrapado;
    try {
      await runWithTenant(7, async () => { await pool.query('SELECT 1'); throw new Error('boom'); });
    } catch (e) { atrapado = e; }
    expect(atrapado.message).to.equal('boom');
    expect(c.query.lastCall.args[0]).to.equal('ROLLBACK');
    expect(c.release.calledOnce).to.equal(true);
  });

  it('sin consultas no abre conexión', async () => {
    const connect = sinon.stub(pg.Pool.prototype, 'connect');
    await runWithTenant(7, async () => 1);
    expect(connect.called).to.equal(false);
  });

  it('anidado en el mismo tenant reutiliza; en otro tenant falla; id inválido falla', async () => {
    sinon.stub(pg.Pool.prototype, 'connect').resolves(fakeClient());
    const adentro = await runWithTenant(7, () => runWithTenant('7', async () => getStore().clienteId));
    expect(adentro).to.equal(7);

    let e1;
    try { await runWithTenant(7, () => runWithTenant(8, async () => 1)); } catch (e) { e1 = e; }
    expect(e1.message).to.include('ya hay un tenant activo');

    let e2;
    try { await runWithTenant('abc', async () => 1); } catch (e) { e2 = e; }
    expect(e2.message).to.include('cliente_id inválido');
  });
});

describe('Bot de Telegram → turn_log', () => {
  const BOT_TOKEN = '123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw1';
  const SECRET = 'secreto-del-webhook-0123456789abcdef';
  const bot = () => ({
    id: 40, cliente_id: 7, provider: 'telegram', external_id: '123456789', nombre: '@pizzeria_test_bot',
    status: 'active', config: {}, credenciales_enc: cripto.encriptar(BOT_TOKEN), webhook_secret_hash: cripto.sha256(SECRET),
  });
  const usuario = () => ({
    vinculo_id: 9, user_id: 21, cliente_id: 7, avisos: true, nombre: 'Ana', apellido: 'Torres',
    deleted_at: null, tipo: 'EMP', modulos: ['operaciones'],
  });
  const update = (texto) => ({
    update_id: 3001,
    message: { message_id: 1, chat: { id: 555, type: 'private' }, from: { id: 555, is_bot: false, first_name: 'Ana' }, text: texto },
  });
  const hook = (body) => request(app).post('/api/canales/telegram/webhook/40')
    .set('X-Telegram-Bot-Api-Secret-Token', SECRET).send(body);

  beforeEach(() => {
    sinon.stub(canalesDb, 'getCuentaInterna').resolves(bot());
    sinon.stub(planService, 'getClienteTierAndFeatures').resolves({
      clienteId: 7, clienteNombre: 'Pizzería Test', tierCode: 'PREMIUM', features: planService.PLAN_FEATURES.PREMIUM, isExpired: false,
    });
    sinon.stub(waDb, 'registrarMensajeEntrante').resolves(true);
    sinon.stub(usuariosDb, 'getUsuarioDelChat').resolves(usuario());
    sinon.stub(usuariosDb, 'tocarUso').resolves();
    sinon.stub(harness, 'manejarTurno').resolves({ intent: 'ventas_periodo', stage: 'ejecutor', ok: true, texto: 'Ventas hoy: $ 1.000 en 1 pedido.' });
  });

  it('mensaje de un usuario vinculado → una fila con user, texto, intent y sin modelo', async () => {
    sinon.stub(telegram, 'sendMessage').resolves({});
    const ins = sinon.stub(turnLog, 'insertar').resolves(1);
    const res = await hook(update('cuánto vendí hoy'));
    expect(res.body.accion).to.equal('interno');
    expect(ins.calledOnce).to.equal(true);
    expect(ins.firstCall.args[0]).to.include({
      cliente_id: 7, user_id: 21, vertical: 'interno', canal: 'telegram', canal_cuenta_id: 40,
      external_user_id: '555', texto: 'cuánto vendí hoy', intent: 'ventas_periodo', stage: 'ejecutor',
      ok: true, model: null, msgs_out: 1,
    });
  });

  it('comandos también son turnos', async () => {
    sinon.stub(telegram, 'sendMessage').resolves({});
    sinon.stub(usuariosDb, 'desvincularPorId').resolves(true);
    const ins = sinon.stub(turnLog, 'insertar').resolves(1);
    await hook(update('/desvincular'));
    expect(ins.firstCall.args[0]).to.include({ intent: 'desvincular', stage: 'comando' });
  });

  it('si responder falla, la fila queda igual (ok=false, stage error)', async () => {
    sinon.stub(console, 'error');
    sinon.stub(mensajesInternos, 'responder').rejects(new Error('se rompió el ejecutor'));
    const send = sinon.stub(telegram, 'sendMessage').resolves({});
    const ins = sinon.stub(turnLog, 'insertar').resolves(1);
    const res = await hook(update('cuánto vendí hoy'));
    expect(res.body.accion).to.equal('error');
    expect(send.called).to.equal(false);
    expect(ins.firstCall.args[0]).to.include({ ok: false, stage: 'error', msgs_out: 0, error: 'se rompió el ejecutor' });
  });

  it('si turn_log falla, el usuario igual recibe la respuesta', async () => {
    sinon.stub(console, 'error');
    const send = sinon.stub(telegram, 'sendMessage').resolves({});
    sinon.stub(turnLog, 'insertar').rejects(new Error('DB caída'));
    const res = await hook(update('hola'));
    expect(res.body.accion).to.equal('interno');
    expect(send.calledOnce).to.equal(true);
  });
});
