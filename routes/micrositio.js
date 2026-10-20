// routes/micrositio.js — /api/micrositio (cliente final, link de WhatsApp)
// Montado con: authenticateHandoff → withTenantConnection → requireFeature.
// Ningún cliente_id en path ni body: el tenant sale del token.
const express = require('express');
const { validateIdParam } = require('../middleware/tenantMiddleware');
const { crearRateLimit } = require('../middleware/rateLimit');
const ctrl = require('../controllers/micrositioController');

// Un link = un cliente final: 10 pedidos cada 15 min por conversación alcanza
// de sobra y frena un script que use un token filtrado.
const limitePedidos = crearRateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  keyGenerator: (req) => `mc:${req.clienteId}:${req.handoff?.conversationId ?? 'x'}`,
  message: { error: 'Demasiados pedidos seguidos. Probá en unos minutos.', code: 'RATE_LIMIT' },
});

const router = express.Router();
router.param('id', validateIdParam);

router.get('/sesion',        ctrl.sesion);
router.get('/productos',     ctrl.productos);
router.get('/productos/:id', ctrl.producto);
router.get('/medios-pago',   ctrl.mediosPago);
router.get('/caja',          ctrl.caja);
router.post('/pedidos',      limitePedidos, ctrl.crearPedido);

module.exports = router;
