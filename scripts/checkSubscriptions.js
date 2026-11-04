// Reconciliación manual de suscripciones con MercadoPago.
// En producción la dispara n8n contra POST /api/cron/billing/reconciliar;
// este script hace lo mismo desde la consola: node scripts/checkSubscriptions.js
require('dotenv').config();
const pool = require('../pool');
const { reconciliarSuscripciones } = require('../services/billing/webhookService');

reconciliarSuscripciones()
  .then((r) => {
    console.log(JSON.stringify(r, null, 2));
  })
  .catch((err) => {
    console.error('Error en la reconciliación:', err);
    process.exitCode = 1;
  })
  .finally(() => pool.end && pool.end());
