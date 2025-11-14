// routes/handoff.js
const express = require('express');
const router = express.Router();
const handoffController = require('../controllers/handoffController');

// Issue short-lived token (called by n8n)
router.post('/sign', handoffController.sign);

// Validate token and return session/cart context (called by PWA /start)
router.get('/resolve', handoffController.resolve);

module.exports = router;
