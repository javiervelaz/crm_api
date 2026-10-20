// routes/whatsaap.js — panel del CRM (JWT de usuario + tenant + RLS).
// Se monta UNA vez, después de withTenantConnection (ver node.js).
const express = require('express');
const { registerTenantGuards } = require('../middleware/tenantMiddleware');
const { requireFeature } = require('../middleware/featureMiddleware');
const ctrl = require('../controllers/whatsaapController');

const router = express.Router();
registerTenantGuards(router);
router.use(requireFeature('canUseWhatsappBot'));

// Listados del tenant del JWT
router.get('/accounts',  ctrl.getAccounts);
router.get('/templates', ctrl.getTemplates);
router.get('/log',       ctrl.getLog);

// Envío: el phone_number_id tiene que ser del tenant (403 si no)
router.post('/send/text',     ctrl.sendText);
router.post('/send/template', ctrl.sendTemplate);

// Flujo SMS viejo sobre la WABA de Counter: retirado (W2 lo reemplaza)
router.post('/request-code', ctrl.gone);
router.post('/activate',     ctrl.gone);

module.exports = router;
