// routes/internalWhatsapp.js — /api/internal/whatsapp (sólo n8n)
// Montado con authenticateService (x-internal-token), SIN JWT de usuario.
const express = require('express');
const { withTenantConnection } = require('../middleware/tenantConnection');
const ctrl = require('../controllers/internalWhatsappController');

const router = express.Router();

router.get('/resolve/:phone_number_id', ctrl.cargarCuenta('params'), withTenantConnection, ctrl.resolve);
router.post('/handoff/sign',            ctrl.cargarCuenta('body'),   withTenantConnection, ctrl.sign);

module.exports = router;
