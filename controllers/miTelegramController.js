// controllers/miTelegramController.js — "Mi Telegram" de cada usuario (staff)
const svc = require('../services/canales/canalesService');

const userIdDe = (req) => Number(req.user?.userId);

const fail = (res, err, tag) => {
  const status = err.status || 500;
  if (status >= 500) console.error(`[mi-telegram] ${tag}:`, err.message);
  return res.status(status).json({ error: status >= 500 ? 'Error interno' : err.message, code: err.code });
};

const conUsuario = (fn, tag) => async (req, res) => {
  const userId = userIdDe(req);
  if (!Number.isInteger(userId) || userId <= 0) return res.status(403).json({ error: 'Usuario inválido', code: 'NO_USER' });
  try { return await fn(req, res, userId); } catch (err) { return fail(res, err, tag); }
};

const estado = conUsuario(async (req, res, userId) => res.json(await svc.miTelegram(req.clienteId, userId)), 'estado');

const vincular = conUsuario(async (req, res, userId) =>
  res.status(201).json(await svc.generarVinculacion(req.clienteId, userId)), 'vincular');

const avisos = conUsuario(async (req, res, userId) => {
  if (typeof req.body?.avisos !== 'boolean') return res.status(400).json({ error: 'avisos tiene que ser true o false' });
  return res.json(await svc.setMisAvisos(req.clienteId, userId, req.body.avisos));
}, 'avisos');

const desvincular = conUsuario(async (req, res, userId) => res.json(await svc.desvincularme(req.clienteId, userId)), 'desvincular');

module.exports = { estado, vincular, avisos, desvincular };
