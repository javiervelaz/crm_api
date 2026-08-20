// middleware/cronAuth.js
// Autenticacion de endpoints de cron: secreto compartido, sin usuario.

const crypto = require('crypto');

/**
 * Compara con timingSafeEqual y no con ===. La diferencia es un side channel
 * chico, pero evitarlo es gratis: === corta en el primer byte distinto y filtra
 * cuantos caracteres del secreto acertaste.
 */
const authenticateCron = (req, res, next) => {
  const recibido = req.header('Authorization') || '';
  const esperado = `Bearer ${process.env.CRON_SECRET}`;

  if (recibido.length !== esperado.length) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  if (!crypto.timingSafeEqual(Buffer.from(recibido), Buffer.from(esperado))) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  return next();
};

module.exports = { authenticateCron };
