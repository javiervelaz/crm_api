// routes/verificacionCron.js
// Vencimiento de cuentas que nunca verificaron el email.
//
// Disparado por n8n (o el cron de Vercel, que para esto sí alcanza: es una
// tarea diaria).
//
//   POST https://api.countercrm.com/api/cron/verificaciones/bloquear-vencidas
//   Authorization: Bearer <CRON_SECRET>

const express = require('express');
const router = express.Router();
const { authenticateCron } = require('../middleware/cronAuth');
const verificacion = require('../services/verificacion/verificacionService');

router.use(authenticateCron);

router.post('/bloquear-vencidas', async (req, res) => {
  try {
    const { bloqueadas } = await verificacion.bloquearVencidas();
    if (bloqueadas) {
      console.log(`[cron/verificaciones] ${bloqueadas} cuenta(s) bloqueadas por no verificar en ${verificacion.BLOQUEO_DIAS} días`);
    }
    return res.json({ bloqueadas });
  } catch (err) {
    console.error('[cron/verificaciones]', err);
    return res.status(500).json({ error: 'Error bloqueando cuentas vencidas' });
  }
});

module.exports = router;
