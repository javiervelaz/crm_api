// routes/handoff.js
const express = require('express');
const router = express.Router();
const { authenticateJWT } = require('../middleware/authMiddleware');
const handoffController = require('../controllers/handoffController');

// Retirado: 410. La emisión la hace /api/internal/whatsapp/handoff/sign.
router.post('/sign', authenticateJWT, handoffController.sign);

// Validación del link del micrositio (credencial = el propio token)
router.get('/resolve', handoffController.resolve);

module.exports = router;
