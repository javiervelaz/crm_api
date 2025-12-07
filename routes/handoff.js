// routes/handoff.js
const express = require('express');
const router = express.Router();
const { authenticateJWT } = require('../middleware/authMiddleware');
const { requireFeature } = require('../middleware/featureMiddleware');
const handoffController = require('../controllers/handoffController');

// Issue short-lived token (called by n8n)
router.post('/sign',authenticateJWT,requireFeature('canUseWhatsappBot'), handoffController.sign);

// Validate token and return session/cart context (called by PWA /start)
router.get('/resolve', authenticateJWT,requireFeature('canUseWhatsappBot'),handoffController.resolve);



module.exports = router;
