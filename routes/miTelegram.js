// routes/miTelegram.js — /api/mi-telegram: cada usuario vincula SU chat.
// Montado después del mount global de /api (JWT + tenant + RLS); los externos
// de la academia quedan afuera por restringirExternos.
const express = require('express');
const { requireFeature } = require('../middleware/featureMiddleware');
const ctrl = require('../controllers/miTelegramController');

const router = express.Router();
router.use(requireFeature('canUseBot'));

router.get('/',             ctrl.estado);
router.post('/vinculacion', ctrl.vincular);
router.patch('/',           ctrl.avisos);
router.delete('/',          ctrl.desvincular);

module.exports = router;
