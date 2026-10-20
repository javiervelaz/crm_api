// controllers/canalesController.js
const canalesDb = require('../model/canales/db');
const planService = require('../services/cliente/planService');
const svc = require('../services/canales/canalesService');
const { coincideHash } = require('../services/canales/cripto');
const { SLUG_RE } = require('../services/canales/slug');

const fail = (res, err, tag) => {
  const status = err.status || 500;
  if (status >= 500) console.error(`[canales] ${tag}:`, err.message);
  return res.status(status).json({ error: status >= 500 && status !== 502 && status !== 503 ? 'Error interno' : err.message, code: err.code });
};

const planCon = async (clienteId, feature) => {
  const plan = await planService.getClienteTierAndFeatures(clienteId);
  return { ...plan, ok: !plan.isExpired && Boolean(plan.features[feature]) };
};

// ─── Panel del CRM (JWT + tenant) ─────────────────────────────────────────────

const listar = async (req, res) => {
  try { return res.json(await svc.listarCanales(req.clienteId)); } catch (err) { return fail(res, err, 'listar'); }
};

const crearLink = async (req, res) => {
  try {
    const plan = await planService.getClienteTierAndFeatures(req.clienteId);
    return res.status(201).json(await svc.obtenerOCrearLink(req.clienteId, plan.clienteNombre));
  } catch (err) { return fail(res, err, 'crearLink'); }
};

const conectarTelegram = async (req, res) => {
  try {
    return res.status(201).json(await svc.conectarTelegram(req.clienteId, req.body?.token));
  } catch (err) { return fail(res, err, 'conectarTelegram'); }
};

const quitarVinculado = async (req, res) => {
  const vinculoId = Number(req.params.vinculoId);
  if (!Number.isInteger(vinculoId) || vinculoId <= 0) return res.status(400).json({ error: 'id inválido', code: 'INVALID_PARAM' });
  try { return res.json(await svc.quitarVinculado(req.clienteId, vinculoId)); } catch (err) { return fail(res, err, 'quitarVinculado'); }
};

const desconectar = async (req, res) => {
  try { return res.json(await svc.desconectar(req.clienteId, Number(req.params.id))); } catch (err) { return fail(res, err, 'desconectar'); }
};

// ─── Webhook de Telegram (público, autenticado con el secret del bot) ─────────

/**
 * Carga la cuenta y valida X-Telegram-Bot-Api-Secret-Token ANTES de abrir la
 * conexión de tenant. canal_cuenta no tiene RLS: es la tabla que define el tenant.
 */
const cargarCuentaTelegram = async (req, res, next) => {
  try {
    const id = Number(req.params.cuentaId);
    if (!Number.isInteger(id) || id <= 0) return res.status(404).end();
    const cuenta = await canalesDb.getCuentaInterna(id);
    if (!cuenta || cuenta.provider !== 'telegram') return res.status(404).end();
    if (!coincideHash(req.header('x-telegram-bot-api-secret-token'), cuenta.webhook_secret_hash)) {
      return res.status(401).end();
    }
    // Bot desconectado o suspendido: 200 para que Telegram no reintente
    if (cuenta.status !== 'active') return res.json({ ok: true, accion: 'inactivo' });
    req.canalCuenta = cuenta;
    req.clienteId = Number(cuenta.cliente_id);
    return next();
  } catch (err) {
    console.error('[canales] cargarCuentaTelegram:', err.message);
    return res.status(500).end();
  }
};

const webhookTelegram = async (req, res) => {
  try {
    const plan = await planCon(req.clienteId, 'canUseBot');
    const r = await svc.procesarUpdateTelegram({ cuenta: req.canalCuenta, update: req.body, plan });
    return res.json({ ok: true, accion: r.accion });
  } catch (err) {
    // 200 igual: un error nuestro no se arregla con reintentos de Telegram
    console.error(`[canales] webhook telegram cuenta ${req.canalCuenta?.id}:`, err.message);
    return res.json({ ok: true, accion: 'error' });
  }
};

// ─── Link público (sin auth: la credencial es el slug) ───────────────────────

const cargarLink = async (req, res, next) => {
  try {
    const slug = String(req.params.slug || '').toLowerCase();
    if (!SLUG_RE.test(slug)) return res.status(404).json({ error: 'Link no encontrado', code: 'LINK_INVALIDO' });
    const cuenta = await canalesDb.getCuentaPorExternal('link', slug);
    if (!cuenta || cuenta.status !== 'active') {
      return res.status(404).json({ error: 'Link no encontrado', code: 'LINK_INVALIDO' });
    }
    req.canalCuenta = cuenta;
    req.clienteId = Number(cuenta.cliente_id);
    return next();
  } catch (err) {
    console.error('[canales] cargarLink:', err.message);
    return res.status(500).json({ error: 'Error interno' });
  }
};

const sesionLink = async (req, res) => {
  try {
    const plan = await planCon(req.clienteId, 'canUsePedidosOnline');
    if (!plan.ok) return res.status(403).json({ error: 'Este comercio no tiene pedidos online activos', code: 'PLAN_INACTIVE' });
    const { token, expiresIn } = svc.sesionLink(req.canalCuenta);
    return res.json({ token, expiresIn, comercio: plan.clienteNombre });
  } catch (err) { return fail(res, err, 'sesionLink'); }
};

module.exports = {
  listar, crearLink, conectarTelegram, desconectar, quitarVinculado,
  cargarCuentaTelegram, webhookTelegram,
  cargarLink, sesionLink,
};
