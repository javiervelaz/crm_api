// routes/canales.js — panel del CRM: /api/canales (JWT + tenant + RLS)
const express = require('express');
const { registerTenantGuards } = require('../middleware/tenantMiddleware');
const { requireFeature } = require('../middleware/featureMiddleware');
const ctrl = require('../controllers/canalesController');

const router = express.Router();
registerTenantGuards(router);

router.get('/',            ctrl.listar);
router.post('/link',       requireFeature('canUsePedidosOnline'), ctrl.crearLink);
router.post('/telegram',   requireFeature('canUseBot'), ctrl.conectarTelegram);
router.delete('/:id',      ctrl.desconectar);

module.exports = router;
