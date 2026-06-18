const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const {
  login
} = require('../controllers/authController');

// Límite: máx 10 intentos de login cada 15 minutos por IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de inicio de sesión. Intentá de nuevo en 15 minutos.' },
});

router.post('/login', loginLimiter, login);

module.exports = router;
