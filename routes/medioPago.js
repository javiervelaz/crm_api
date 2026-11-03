const express = require('express');
const router = express.Router();
const { registerTenantGuards } = require('../middleware/tenantMiddleware');
registerTenantGuards(router);
const {
  getMedioPagoById,
  getMedioPagoList,
} = require('../controllers/medioPagoController');

// medio_pago es un catálogo GLOBAL (sin cliente_id): lo comparten todos los
// comercios. Antes cualquier usuario logueado de cualquier comercio podía
// crear, renombrar o borrar filas acá y le cambiaba la app a todos. Las
// escrituras se sacaron; si hiciera falta cargarlo, va por /api/platform.

router.get('/list', getMedioPagoList);
router.get('/:id', getMedioPagoById);

module.exports = router;
