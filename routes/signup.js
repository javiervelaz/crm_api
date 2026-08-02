// routes/signup.js
const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();

const { signup } = require('../controllers/signupController');
const { signupRules, handleValidation } = require('../validators/signupValidator');

// Alta pública: sin esto te llenan la DB de tenants basura en una tarde
const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de registro. Probá de nuevo en una hora.' },
});

router.post('/', signupLimiter, signupRules, handleValidation, signup);

module.exports = router;