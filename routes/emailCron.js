// routes/emailCron.js
// Drenado de la cola de emails, disparado desde afuera.
//
// El cron NO es de Vercel: en plan Hobby los crons corren una vez por dia, lo
// que es inservible para transaccional. Lo dispara n8n (Contabo) cada 60s:
//
//   Schedule Trigger (1 min)
//     -> HTTP Request POST https://api.countercrm.com/api/cron/email-outbox
//        Authorization: Bearer <CRON_SECRET>
//
// Se monta ANTES de authenticateJWT: no hay usuario, hay secreto compartido.

const express = require('express');
const router = express.Router();
const mailer = require('../services/email');
const { authenticateCron } = require('../middleware/cronAuth');

router.use(authenticateCron);

router.post('/', async (req, res) => {
  const limit = Math.min(Number(req.body?.limit) || Number(process.env.EMAIL_DRAIN_BATCH) || 20, 100);

  try {
    const resultado = await mailer.drain({ limit });
    if (resultado.procesados) {
      console.log(
        `[cron/email-outbox] ${resultado.sent} enviados, ` +
        `${resultado.retry} a reintento, ${resultado.failed} fallidos`
      );
    }
    return res.json(resultado);
  } catch (err) {
    console.error('[cron/email-outbox]', err);
    return res.status(500).json({ error: 'Error drenando la cola de emails' });
  }
});

// Diagnostico rapido: cuantos mails hay en cada estado.
router.get('/stats', async (req, res) => {
  try {
    return res.json(await mailer.stats());
  } catch (err) {
    console.error('[cron/email-outbox/stats]', err);
    return res.status(500).json({ error: 'Error consultando la cola' });
  }
});

module.exports = router;
