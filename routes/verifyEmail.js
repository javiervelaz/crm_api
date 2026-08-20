// routes/verifyEmail.js
// Verificacion de email y activacion de cuenta. Rutas publicas.

const express = require('express');
const { crearRateLimit } = require('../middleware/rateLimit');
const router = express.Router();

const userService = require('../services/user/userService');
const { issueToken, TTL } = require('../services/auth/tokenService');
const verificacion = require('../services/verificacion/verificacionService');

// Reenvio: 3 por hora por IP. Sin esto el endpoint es un caño para mandar
// mails desde nuestro dominio a cualquier casilla registrada.
const reenvioLimiter = crearRateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: { ok: true },   // ni siquiera el rate limit revela si el email existe
});

// Verificar el token es idempotente y barato, pero el limite corta el
// escaneo de tokens por fuerza bruta.
const verificarLimiter = crearRateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Demasiados intentos. Probá de nuevo en un rato.' },
});

/**
 * GET /api/verify-email/:token
 * Activa la cuenta y devuelve sesión: el usuario hace un click y entra.
 * Mandarlo de vuelta al login a tipear la contraseña que puso hace treinta
 * segundos es donde se pierde gente.
 */
router.get('/:token', verificarLimiter, async (req, res) => {
  try {
    const { clienteId, userId, email, yaEstabaActivo } = await verificacion.verificar(req.params.token);

    let token = null;
    try {
      const sessionUser = await userService.buildSessionById(userId);
      if (sessionUser) token = issueToken(sessionUser);
    } catch (err) {
      // La cuenta YA quedó activa: no podemos fallar el request por no haber
      // podido armar la sesión. Que entre por el login.
      console.error(`[verifyEmail] sesión post-activación falló (cliente ${clienteId}):`, err.message);
    }

    return res.json({
      ok: true,
      email,
      yaEstabaActivo,
      ...(token && { token, expiresIn: TTL }),
    });
  } catch (err) {
    if (err instanceof verificacion.VerificacionError) {
      return res.status(err.status).json({ error: err.message, code: err.code });
    }
    console.error('[verifyEmail]', err);
    return res.status(500).json({ error: 'Error verificando el email' });
  }
});

/**
 * POST /api/verify-email/resend  { email }
 *
 * SIEMPRE responde 200 { ok: true }, exista o no la cuenta. Un 404 acá
 * convierte el endpoint en un enumerador: cualquiera prueba direcciones y
 * sabe cuáles están registradas.
 */
router.post('/resend', reenvioLimiter, async (req, res) => {
  const email = req.body?.email;

  try {
    const { enviado, clienteId } = await verificacion.reenviar(email);
    if (enviado) console.log(`[verifyEmail] link reenviado (cliente ${clienteId})`);
  } catch (err) {
    // Ni un error interno puede cambiar la respuesta: la diferencia de
    // comportamiento entre "existe" y "no existe" es la fuga que evitamos.
    console.error('[verifyEmail/resend]', err);
  }

  return res.json({ ok: true });
});

module.exports = router;
