// routes/canalesPublico.js — entradas públicas de los canales (sin JWT)
//   POST /api/canales/telegram/webhook/:cuentaId   (secret del bot)
//   POST /api/publico/pedidos/:slug/sesion          (link público)
const express = require('express');
const { withTenantConnection } = require('../middleware/tenantConnection');
const { crearRateLimit } = require('../middleware/rateLimit');
const ctrl = require('../controllers/canalesController');

const webhooks = express.Router();
webhooks.post('/telegram/webhook/:cuentaId', ctrl.cargarCuentaTelegram, withTenantConnection, ctrl.webhookTelegram);

const publico = express.Router();
const limiteSesiones = crearRateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 30,
  message: { error: 'Demasiados intentos. Probá en unos minutos.', code: 'RATE_LIMIT' },
});
publico.post('/pedidos/:slug/sesion', limiteSesiones, ctrl.cargarLink, withTenantConnection, ctrl.sesionLink);

module.exports = { webhooks, publico };
