// routes/canales.js — panel del CRM: /api/canales (JWT + tenant + RLS)
const express = require('express');
const { registerTenantGuards } = require('../middleware/tenantMiddleware');
const { requireFeature } = require('../middleware/featureMiddleware');
const { authorizeRole } = require('../middleware/authMiddleware');
const ctrl = require('../controllers/canalesController');

const router = express.Router();
registerTenantGuards(router);
// Conectar bots y ver el link de avisos es cosa del dueño, no del empleado
router.use(authorizeRole(['admin']));

router.get('/',            ctrl.listar);
router.post('/link',       requireFeature('canUsePedidosOnline'), ctrl.crearLink);
router.post('/telegram',   requireFeature('canUseBot'), ctrl.conectarTelegram);
router.delete('/:id',      ctrl.desconectar);

module.exports = router;
