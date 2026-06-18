// routes/handoff.js
const express = require('express');
const router = express.Router();
const { authenticateJWT } = require('../middleware/authMiddleware');
const { requireFeature } = require('../middleware/featureMiddleware');
const handoffController = require('../controllers/handoffController');

// Issue short-lived token (called by n8n — requiere JWT del sistema)
router.post('/sign', authenticateJWT, handoffController.sign);

// Validate token and return session/cart context (called by PWA /start — usa handoff JWT propio)
router.get('/resolve', handoffController.resolve);



module.exports = router;
