// routes/eduCuotasCron.js — tareas de cuotas para n8n (/api/cron/edu-cuotas).
//
//   Authorization: Bearer <CRON_SECRET>
//   POST /generar               { "periodo": "2026-11" }  (opcional; por defecto el mes actual)
//                               Genera las cuotas del mes de todas las academias. Idempotente.
//   GET  /pendientes-revision   Pagos con comprobante esperando al admin, sin avisar, por academia.
//   POST /pendientes-revision/avisados  { "ids": [12, 13] }   Los marca como avisados.
const express = require('express');
const { authenticateCron } = require('../middleware/cronAuth');
const c = require('../controllers/eduCuotasController');

const router = express.Router();
router.use(authenticateCron);

router.post('/generar', c.cronGenerar);
router.get('/pendientes-revision', c.cronPendientes);
router.post('/pendientes-revision/avisados', c.cronAvisados);

module.exports = router;
