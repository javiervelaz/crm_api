const express    = require('express');

const router     = express.Router();

const  {
    requestCode,
    activate,
    resolve,
    getAccounts,
    getTemplates,
    getLog,
    sendText,
    sendTemplate
} = require('../controllers/whatsaapController');
const { authenticateJWT } = require('../middleware/authMiddleware');

// ─── Alta de número (admin panel) ────────────────────────────────────────────

// ─── Resolución de cliente (llamado por n8n, sin JWT, token propio) ───────────
// GET  /api/whatsapp/resolve/:phone_number_id
router.get('/resolve/:phone_number_id', resolve);

// ─── Listados ─────────────────────────────────────────────────────────────────
// GET  /api/whatsapp/accounts/:cliente_id
router.get('/accounts/:cliente_id',  authenticateJWT, getAccounts);

// GET  /api/whatsapp/templates/:cliente_id
router.get('/templates/:cliente_id', authenticateJWT, getTemplates);

// GET  /api/whatsapp/log/:cliente_id?limit=50&offset=0
router.get('/log/:cliente_id',       authenticateJWT, getLog);

// POST /api/whatsapp/request-code  → solicita SMS a Meta
router.post('/request-code', authenticateJWT, requestCode);

// POST /api/whatsapp/activate      → verifica código + activa en Cloud API + crea template
router.post('/activate',     authenticateJWT, activate);

// ─── Envío de mensajes ────────────────────────────────────────────────────────
// POST /api/whatsapp/send/text
router.post('/send/text',     authenticateJWT, sendText);

// POST /api/whatsapp/send/template
router.post('/send/template', authenticateJWT, sendTemplate);

module.exports = router;
