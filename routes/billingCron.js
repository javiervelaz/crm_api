// routes/billingCron.js — reconciliación de suscripciones con MercadoPago (/api/cron/billing).
//
//   Authorization: Bearer <CRON_SECRET>
//   POST /reconciliar   Trae de MP el estado de cada suscripción viva (pending /
//                       active / paused) y lo aplica. Red de seguridad por si se
//                       perdió un webhook. Lo dispara n8n una vez por día.
//                       → { revisadas, cambios: [...], errores: [...] }
const express = require('express');
const { authenticateCron } = require('../middleware/cronAuth');
const webhookService = require('../services/billing/webhookService');

const router = express.Router();
router.use(authenticateCron);

router.post('/reconciliar', async (req, res) => {
  try {
    const r = await webhookService.reconciliarSuscripciones();
    return res.json(r);
  } catch (err) {
    console.error('[BILLING CRON] Error en la reconciliación:', err);
    return res.status(500).json({ error: 'No se pudo reconciliar' });
  }
});

module.exports = router;
