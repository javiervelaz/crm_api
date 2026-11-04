const express = require('express');
const router = express.Router();
const { simulateWebhook, USE_MOCK } = require('../services/billing/mercadoPagoService');
const webhookService = require('../services/billing/webhookService');

/**
 * REAL WEBHOOK (MP_MOCK = false)
 * Nota: se lee process.env.MP_MOCK en tiempo de request (no al cargar el modulo)
 * para que los tests puedan cambiar el valor entre suites sin reiniciar el proceso.
 * La lógica vive en services/billing/webhookService.js.
 */
router.post('', async (req, res) => {
  if (process.env.MP_MOCK === 'true') {
    return res.status(200).send('MOCK MODE ACTIVE');
  }

  const firma = webhookService.verificarFirma(req);
  if (!firma.ok) return res.status(firma.status).json({ error: firma.error });

  const { http, texto } = await webhookService.procesarEvento(req.body, {
    requestId: req.headers['x-request-id'],
  });
  return res.status(http).send(texto);
});

/**
 * MOCK WEBHOOK (LOCAL ONLY)
 */
router.post('/mock', async (req, res) => {
  if (!USE_MOCK) {
    return res.status(400).json({ error: 'MOCK disabled in environment' });
  }

  const { preapprovalId } = req.body;

  if (!preapprovalId) {
    return res.status(400).json({ error: 'Missing preapprovalId' });
  }

  await simulateWebhook(preapprovalId);

  res.json({ ok: true });
});

module.exports = router;
