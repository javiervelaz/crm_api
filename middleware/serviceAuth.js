// middleware/serviceAuth.js
//
// Credencial de servicio para n8n: header `x-internal-token` contra
// N8N_INTERNAL_TOKEN. Sin JWT de usuario. Falla cerrado si la env no está.
const crypto = require('crypto');

const safeEqual = (a, b) => {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
};

const authenticateService = (req, res, next) => {
  const expected = process.env.N8N_INTERNAL_TOKEN;
  if (!expected || expected.length < 24) {
    console.error('[serviceAuth] N8N_INTERNAL_TOKEN no configurado (o < 24 caracteres)');
    return res.status(503).json({ error: 'Servicio interno no configurado' });
  }
  const got = req.header('x-internal-token');
  if (!got || !safeEqual(got, expected)) {
    return res.status(401).json({ error: 'Token de servicio inválido' });
  }
  req.service = 'n8n';
  next();
};

module.exports = { authenticateService, safeEqual };
