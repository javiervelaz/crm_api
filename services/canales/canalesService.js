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
const waDb = require('../../model/whatsaap/db');
const telegram = require('./telegramApi');
const cripto = require('./cripto');
const { generarSlug } = require('./slug');
const { signHandoff, micrositioUrl } = require('../whatsaap/handoffService');

const TOKEN_BOT_RE = /^\d{5,20}:[A-Za-z0-9_-]{30,60}$/;
const MAX_CHATS_AVISOS = 10;

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
    const config = c.config || {};
    return {
      ...base,
      url_bot: username ? `https://t.me/${username}` : null,
      url_avisos: username && config.avisos_code ? `https://t.me/${username}?start=avisos_${config.avisos_code}` : null,
      chats_avisos: Array.isArray(config.avisos_chat_ids) ? config.avisos_chat_ids.length : 0,
    };
  }
  return base;
};

const listarCanales = async (clienteId) => {
  const cuentas = await db.listarPorCliente(clienteId);
  const wa = await waDb.getWhatsappByClienteId(clienteId);
  const link = cuentas.find((c) => c.provider === 'link');
  return {
    link: link ? presentarCuenta(link) : null,
    telegram: cuentas.filter((c) => c.provider === 'telegram').map(presentarCuenta),
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
    config: { avisos_code: cripto.secretoAleatorio(12) },
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
  const config = cuenta.config || {};
  const avisos = Array.isArray(config.avisos_chat_ids) ? config.avisos_chat_ids.map(String) : [];
  const comercio = plan.clienteNombre || 'el local';

  // Dueño o cocina registrándose para los avisos de pedidos
  const m = texto.match(/^\/start\s+avisos_([a-f0-9]{24})$/);
  if (m) {
    if (!config.avisos_code || !cripto.coincideHash(m[1], cripto.sha256(config.avisos_code))) {
      return { accion: 'codigo_invalido' };
    }
    if (!avisos.includes(String(chatId))) {
      if (avisos.length >= MAX_CHATS_AVISOS) {
        await telegram.sendMessage(token, chatId, `Ya hay ${MAX_CHATS_AVISOS} chats recibiendo avisos de ${comercio}.`);
        return { accion: 'avisos_lleno' };
      }
      await db.mergeConfig(cuenta.id, { avisos_chat_ids: [...avisos, String(chatId)] });
    }
    await telegram.sendMessage(token, chatId, `Listo. Desde ahora vas a recibir acá los pedidos nuevos de ${comercio}.`);
    return { accion: 'avisos_registrado' };
  }

  if (avisos.includes(String(chatId)) && texto !== '/pedir') {
    await telegram.sendMessage(token, chatId,
      `Este chat recibe los avisos de pedidos de ${comercio}. Escribí /pedir para ver el link como lo ve un cliente.`);
    return { accion: 'chat_de_avisos' };
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
const prepararAvisos = async (clienteId, datosPedido) => {
  const cuentas = await db.getCuentasAvisos(clienteId);
  if (!cuentas.length) return async () => 0;
  const texto = textoAviso(datosPedido);
  const envios = [];
  for (const c of cuentas) {
    let token;
    try { token = cripto.desencriptar(c.credenciales_enc); } catch { continue; }
    for (const chatId of c.config.avisos_chat_ids || []) envios.push({ token, chatId });
  }
  return async () => {
    const r = await Promise.allSettled(envios.map((e) => telegram.sendMessage(e.token, e.chatId, texto)));
    const fallidos = r.filter((x) => x.status === 'rejected');
    if (fallidos.length) console.warn(`[canales] ${fallidos.length} aviso(s) de pedido no enviados (cliente ${clienteId})`);
    return r.length - fallidos.length;
  };
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
  TOKEN_BOT_RE,
};
