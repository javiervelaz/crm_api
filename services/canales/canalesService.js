// services/canales/canalesService.js
//
// Capa de canales del micrositio de pedidos:
//   link      → link público del micrositio (todos los planes)
//   telegram  → bot propio del comercio (planes con canUseBot)
//   whatsapp  → Cloud API, implementado en W0 y apagado con CANAL_WHATSAPP_ENABLED
//
// Cada comercio conecta SU bot de Telegram (lo crea con @BotFather): el cliente
// final ve el nombre del comercio y cada bot queda aislado.
const db = require('../../model/canales/db');
const usuariosDb = require('../../model/canales/usuarios');
const mensajesInternos = require('./mensajesInternos');
const usage = require('../harness/core/usage');
const waDb = require('../../model/whatsaap/db');
const telegram = require('./telegramApi');
const cripto = require('./cripto');
const { generarSlug } = require('./slug');
const { signHandoff, micrositioUrl } = require('../whatsaap/handoffService');

const TOKEN_BOT_RE = /^\d{5,20}:[A-Za-z0-9_-]{30,60}$/;
const VINCULACION_TTL_SEGUNDOS = 600;

const httpError = (status, message, code) => {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
};

const publicApiUrl = () => (process.env.PUBLIC_API_URL || 'https://api.countercrm.com').replace(/\/+$/, '');
const publicAppUrl = () => (process.env.PUBLIC_APP_URL || 'https://app.countercrm.com').replace(/\/+$/, '');
const whatsappHabilitado = () => process.env.CANAL_WHATSAPP_ENABLED === 'true';

// ─── Presentación ─────────────────────────────────────────────────────────────

const presentarCuenta = (c) => {
  const base = { id: c.id, provider: c.provider, nombre: c.nombre, status: c.status, created_at: c.created_at };
  if (c.provider === 'link') {
    return { ...base, slug: c.external_id, url: `${publicAppUrl()}/p/${c.external_id}` };
  }
  if (c.provider === 'telegram') {
    const username = String(c.nombre || '').replace(/^@/, '');
    return { ...base, url_bot: username ? `https://t.me/${username}` : null };
  }
  return base;
};

const listarCanales = async (clienteId) => {
  const cuentas = await db.listarPorCliente(clienteId);
  const wa = await waDb.getWhatsappByClienteId(clienteId);
  const link = cuentas.find((c) => c.provider === 'link');
  return {
    link: link ? presentarCuenta(link) : null,
    telegram: await Promise.all(cuentas.filter((c) => c.provider === 'telegram').map(async (c) => ({
      ...presentarCuenta(c),
      vinculados: (await usuariosDb.listarVinculados(clienteId, c.id)).map((v) => ({
        id: v.id, user_id: v.user_id, nombre: v.nombre, avisos: v.avisos, created_at: v.created_at, ultimo_uso_at: v.ultimo_uso_at,
        recibe_avisos: v.avisos && v.acceso_pedidos === true,
      })),
    }))),
    whatsapp: {
      habilitado: whatsappHabilitado(),
      cuentas: wa.map((w) => ({ id: w.id, nombre: w.wa_display, status: w.status })),
    },
  };
};

// ─── Link público ─────────────────────────────────────────────────────────────

const obtenerOCrearLink = async (clienteId, nombreComercio) => {
  const existente = await db.getLinkDelCliente(clienteId);
  if (existente && existente.status === 'active') return presentarCuenta(existente);
  if (existente) {
    return presentarCuenta(await db.setStatus(clienteId, existente.id, 'active'));
  }
  for (let intento = 0; intento < 3; intento += 1) {
    const slug = generarSlug(nombreComercio);
    const cuenta = await db.upsertCuenta({ clienteId, provider: 'link', externalId: slug, nombre: slug });
    if (cuenta) return presentarCuenta(cuenta);
  }
  throw httpError(500, 'No se pudo generar el link', 'SLUG');
};

/** Sesión del micrositio para el link público. Llamar dentro del contexto de tenant. */
const sesionLink = (cuenta) => {
  const ttl = parseInt(process.env.LINK_SESION_TTL_SECONDS || '7200', 10);
  const { token, expiresIn } = signHandoff({
    clienteId: Number(cuenta.cliente_id),
    canal: 'link',
    canalCuentaId: cuenta.id,
    ttl,
  });
  return { token, expiresIn };
};

// ─── Telegram: alta y baja ────────────────────────────────────────────────────

const conectarTelegram = async (clienteId, tokenBot) => {
  const token = String(tokenBot || '').trim();
  if (!TOKEN_BOT_RE.test(token)) {
    throw httpError(400, 'El token no tiene el formato de @BotFather (123456:ABC...)', 'TELEGRAM_TOKEN_INVALIDO');
  }
  const credencialesEnc = cripto.encriptar(token); // falla con 503 si falta CANAL_ENC_KEY

  const bot = await telegram.getMe(token);
  if (!bot || !bot.is_bot) throw httpError(400, 'El token no es de un bot', 'TELEGRAM_TOKEN_INVALIDO');

  const secret = cripto.secretoAleatorio(32);
  const cuenta = await db.upsertCuenta({
    clienteId,
    provider: 'telegram',
    externalId: String(bot.id),
    nombre: `@${bot.username}`,
    credencialesEnc,
    webhookSecretHash: cripto.sha256(secret),
  });
  if (!cuenta) throw httpError(409, 'Ese bot ya está conectado a otro comercio', 'TELEGRAM_BOT_EN_USO');

  try {
    await telegram.setWebhook(token, {
      url: `${publicApiUrl()}/api/canales/telegram/webhook/${cuenta.id}`,
      secretToken: secret,
    });
  } catch (err) {
    await db.setStatus(clienteId, cuenta.id, 'disconnected');
    throw err;
  }
  return presentarCuenta(cuenta);
};

const desconectar = async (clienteId, id) => {
  const cuenta = await db.getCuentaDelCliente(clienteId, id);
  if (!cuenta) throw httpError(404, 'Canal no encontrado', 'NOT_FOUND');
  if (cuenta.provider === 'telegram' && cuenta.credenciales_enc) {
    try {
      await telegram.deleteWebhook(cripto.desencriptar(cuenta.credenciales_enc));
    } catch (err) {
      // Si el dueño ya borró el bot en @BotFather, igual se desconecta acá
      console.warn(`[canales] deleteWebhook cuenta ${id}: ${err.message}`);
    }
  }
  return presentarCuenta(await db.setStatus(clienteId, id, 'disconnected'));
};

// ─── Telegram: mensajes entrantes ─────────────────────────────────────────────

const nombreDe = (from) => [from?.first_name, from?.last_name].filter(Boolean).join(' ').trim();

/**
 * Procesa un update del webhook de un bot. Corre dentro del contexto de tenant.
 * Devuelve qué hizo (para logs/tests).
 */
const procesarUpdateTelegram = async ({ cuenta, update, plan }) => {
  const msg = update && update.message;
  if (!msg || !msg.chat || msg.chat.type !== 'private' || !msg.from || msg.from.is_bot) {
    return { accion: 'ignorado' };
  }
  if (!plan.ok) return { accion: 'plan_inactivo' };

  // Reintentos de Telegram del mismo update
  if (update.update_id != null && !(await waDb.registrarMensajeEntrante(`tg:${cuenta.id}:${update.update_id}`))) {
    return { accion: 'duplicado' };
  }

  const token = cripto.desencriptar(cuenta.credenciales_enc);
  const chatId = msg.chat.id;
  const texto = String(msg.text || '').trim();
  const comercio = plan.clienteNombre || 'el local';

  // 1) Vinculación de un usuario de Counter: /start v_<código de un solo uso>
  const m = texto.match(/^\/start\s+v_([a-f0-9]{32})$/);
  if (m) {
    const v = await usuariosDb.consumirVinculacion(cripto.sha256(m[1]), cuenta.id);
    if (!v || Number(v.cliente_id) !== Number(cuenta.cliente_id)) {
      await telegram.sendMessage(token, chatId,
        'Ese link de vinculación ya se usó o venció. Generá uno nuevo desde Counter → Mi Telegram.');
      return { accion: 'vinculacion_invalida' };
    }
    await usuariosDb.vincular({ clienteId: Number(cuenta.cliente_id), userId: Number(v.user_id), canalCuentaId: cuenta.id, chatId: String(chatId) });
    const u = await usuariosDb.getUsuarioDelChat(cuenta.id, String(chatId));
    await telegram.sendMessage(token, chatId, mensajesInternos.textoBienvenida({ nombre: u?.nombre, comercio, recibeAvisos: puedeRecibirAvisos(u) }));
    return { accion: 'vinculado', userId: Number(v.user_id) };
  }

  // 2) Chat vinculado a un usuario: el bot habla con el comercio, no con un cliente
  const usuario = await usuariosDb.getUsuarioDelChat(cuenta.id, String(chatId));
  if (usuario) {
    if (!esStaffActivo(usuario)) {
      // Baja o pasó a externo: se corta el vínculo y el chat vuelve a ser anónimo
      await usuariosDb.desvincularPorId(Number(cuenta.cliente_id), usuario.vinculo_id);
    } else {
      await usuariosDb.tocarUso(usuario.vinculo_id);
      // Cada mensaje de un usuario vinculado es un turno del harness interno:
      // una fila en turn_log, siempre (también comandos y errores).
      const turno = (extra) => usage.registrarTurno({
        clienteId: cuenta.cliente_id, userId: usuario.user_id, vertical: 'interno',
        canal: 'telegram', canalCuentaId: cuenta.id, externalUserId: String(chatId),
        texto, msgsOut: 1, ...extra,
      });
      if (texto === '/desvincular') {
        await usuariosDb.desvincularPorId(Number(cuenta.cliente_id), usuario.vinculo_id);
        await telegram.sendMessage(token, chatId, `Listo, desvinculé este chat de tu usuario de ${comercio}. Ya no vas a recibir avisos acá.`);
        await turno({ intent: 'desvincular', stage: 'comando' });
        return { accion: 'desvinculado' };
      }
      if (texto !== '/pedir') {
        const { resultado: respuesta, error, latencyMs } = await usage.medir(async () => {
          const rta = await mensajesInternos.responder({ usuario, comercio, texto, plan });
          await telegram.sendMessage(token, chatId, rta.texto, rta.extra || {});
          return rta;
        });
        if (error) {
          await turno({ stage: 'error', ok: false, msgsOut: 0, latencyMs, error: error.message });
          throw error;
        }
        await turno({
          intent: respuesta.intent, stage: respuesta.stage || 'fijo', ok: respuesta.ok !== false,
          gasto: respuesta.gasto === true, uso: respuesta.uso, latencyMs,
        });
        return { accion: 'interno', intent: respuesta.intent };
      }
      // /pedir: el dueño ve el link tal cual lo recibe un cliente (sigue abajo)
      await turno({ intent: 'pedir', stage: 'comando' });
    }
  }

  // El cliente compartió su teléfono con el botón de contacto
  const telefono = msg.contact && msg.contact.user_id === msg.from.id
    ? String(msg.contact.phone_number || '').replace(/\D/g, '') || null
    : null;

  const conv = await db.findOrCreateConversacion({
    clienteId: Number(cuenta.cliente_id),
    provider: 'telegram',
    canalCuentaId: cuenta.id,
    externalUserId: String(chatId),
    telefono,
  });

  const { token: tokenSesion } = signHandoff({
    clienteId: Number(cuenta.cliente_id),
    canal: 'telegram',
    canalCuentaId: cuenta.id,
    conversationId: Number(conv.id),
    externalUserId: String(chatId),
    userPhoneE164: conv.phone_e164 || null,
  });
  const nombre = (msg.from.first_name || '').trim();
  await telegram.sendMessage(
    token,
    chatId,
    `${nombre ? `¡Hola ${nombre}! ` : '¡Hola! '}Hacé tu pedido a ${comercio} desde acá 👇`,
    { reply_markup: { inline_keyboard: [[{ text: 'Hacer mi pedido', url: micrositioUrl(tokenSesion) }]] } }
  );
  return { accion: 'link_enviado', conversationId: Number(conv.id), nombre: nombreDe(msg.from) };
};

// ─── Avisos de pedido nuevo al dueño ──────────────────────────────────────────

const fmtPesos = (n) => `$${Number(n).toLocaleString('es-AR', { maximumFractionDigits: 2 })}`;

const textoAviso = ({ comandaNro, total, nombre, tipoEntrega, direccion, telefono, canal, items, observaciones }) => [
  `🛎️ Pedido nuevo${comandaNro ? ` #${comandaNro}` : ''} — ${fmtPesos(total)}`,
  `${nombre} · ${tipoEntrega === 'delivery' ? `Delivery a ${direccion}` : 'Retira en el local'}`,
  telefono ? `Tel: ${telefono}` : null,
  '',
  ...items.map((i) => `• ${i.cantidad} × ${i.nombre}${i.observaciones ? ` (${i.observaciones})` : ''}`),
  observaciones ? `\nNota: ${observaciones}` : null,
  `\nEntró por ${canal === 'link' ? 'el link de pedidos' : canal === 'telegram' ? 'Telegram' : 'WhatsApp'}.`,
].filter((l) => l !== null).join('\n');

/**
 * Prepara los envíos dentro del contexto de tenant (lee y desencripta) y
 * devuelve una función que los manda SIN tocar la DB: se llama después de
 * responder al cliente, cuando la conexión de tenant ya se cerró.
 */
/** Puede recibir avisos de pedidos: staff activo con el módulo de pedidos. */
const esStaffActivo = (u) => Boolean(u) && !u.deleted_at && !usuariosDb.TIPOS_EXTERNOS.includes(u.tipo);
const puedeRecibirAvisos = (u) => esStaffActivo(u) && (u.modulos || []).includes('operaciones');

/**
 * Prepara los envíos dentro del contexto de tenant (lee y desencripta) y
 * devuelve una función que los manda SIN tocar la DB: se llama después de
 * responder al cliente, cuando la conexión de tenant ya se cerró.
 */
const prepararAvisos = async (clienteId, datosPedido) => {
  const destinatarios = await usuariosDb.getDestinatariosAvisos(clienteId);
  if (!destinatarios.length) return async () => 0;
  const texto = textoAviso(datosPedido);
  const tokens = new Map();
  const envios = [];
  for (const d of destinatarios) {
    if (!tokens.has(d.canal_cuenta_id)) {
      try { tokens.set(d.canal_cuenta_id, cripto.desencriptar(d.credenciales_enc)); } catch { tokens.set(d.canal_cuenta_id, null); }
    }
    const token = tokens.get(d.canal_cuenta_id);
    if (token) envios.push({ token, chatId: d.chat_id });
  }
  return async () => {
    const r = await Promise.allSettled(envios.map((e) => telegram.sendMessage(e.token, e.chatId, texto)));
    const fallidos = r.filter((x) => x.status === 'rejected');
    if (fallidos.length) console.warn(`[canales] ${fallidos.length} aviso(s) de pedido no enviados (cliente ${clienteId})`);
    return r.length - fallidos.length;
  };
};

// ─── "Mi Telegram": vinculación de cada usuario ───────────────────────────────

const botDelComercio = async (clienteId) => {
  const bot = await db.getTelegramActivo(clienteId);
  if (!bot) throw httpError(404, 'El comercio no tiene un bot de Telegram conectado', 'SIN_BOT');
  return bot;
};

const miTelegram = async (clienteId, userId) => {
  const bot = await db.getTelegramActivo(clienteId);
  if (!bot) return { bot: null, vinculo: null };
  const vinculo = await usuariosDb.getVinculoDeUsuario(clienteId, userId, bot.id);
  return { bot: presentarCuenta(bot), vinculo };
};

const generarVinculacion = async (clienteId, userId) => {
  const bot = await botDelComercio(clienteId);
  const username = String(bot.nombre || '').replace(/^@/, '');
  const codigo = cripto.secretoAleatorio(16); // 32 hex: entra en el start param de Telegram (64)
  await usuariosDb.crearVinculacion({
    codigoHash: cripto.sha256(codigo), clienteId, userId, canalCuentaId: bot.id, ttlSegundos: VINCULACION_TTL_SEGUNDOS,
  });
  return { url: `https://t.me/${username}?start=v_${codigo}`, expira_en: VINCULACION_TTL_SEGUNDOS, bot: bot.nombre };
};

const setMisAvisos = async (clienteId, userId, avisos) => {
  const bot = await botDelComercio(clienteId);
  const v = await usuariosDb.setAvisos(clienteId, userId, bot.id, Boolean(avisos));
  if (!v) throw httpError(404, 'Tu Telegram no está vinculado', 'SIN_VINCULO');
  return v;
};

const desvincularme = async (clienteId, userId) => {
  const bot = await botDelComercio(clienteId);
  if (!(await usuariosDb.desvincularUsuario(clienteId, userId, bot.id))) {
    throw httpError(404, 'Tu Telegram no está vinculado', 'SIN_VINCULO');
  }
  return { ok: true };
};

/** El admin le saca el vínculo a cualquiera de su comercio. */
const quitarVinculado = async (clienteId, vinculoId) => {
  if (!(await usuariosDb.desvincularPorId(clienteId, vinculoId))) throw httpError(404, 'Vínculo no encontrado', 'NOT_FOUND');
  return { ok: true };
};

module.exports = {
  presentarCuenta,
  listarCanales,
  obtenerOCrearLink,
  sesionLink,
  conectarTelegram,
  desconectar,
  procesarUpdateTelegram,
  prepararAvisos,
  textoAviso,
  miTelegram,
  generarVinculacion,
  setMisAvisos,
  desvincularme,
  quitarVinculado,
  VINCULACION_TTL_SEGUNDOS,
  TOKEN_BOT_RE,
};
