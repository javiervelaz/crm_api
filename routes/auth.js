const express = require('express');
const router = express.Router();
const { crearRateLimit } = require('../middleware/rateLimit');
const {
  login
} = require('../controllers/authController');

// Límite: máx 10 intentos de login cada 15 minutos por IP
const loginLimiter = crearRateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Demasiados intentos de inicio de sesión. Intentá de nuevo en 15 minutos.' },
});

router.post('/login', loginLimiter, login);

module.exports = router;
