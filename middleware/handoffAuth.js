// middleware/handoffAuth.js
//
// Autenticación del micrositio con el token de handoff. Acepta
// `Authorization: Bearer <handoff>` o `x-handoff-token`. No por query string:
// el token no tiene que quedar en logs de Nginx/proxies en cada request.
// Deja req.handoff (payload) y req.clienteId (tenant firmado por la API).
const { verifyHandoff } = require('../services/whatsaap/handoffService');

const authenticateHandoff = (req, res, next) => {
  const bearer = req.header('Authorization');
  const token = (bearer && bearer.startsWith('Bearer ') ? bearer.slice(7) : null)
    || req.header('x-handoff-token');
  if (!token) return res.status(401).json({ error: 'Falta el token del link', code: 'NO_TOKEN' });
  try {
    const payload = verifyHandoff(token);
    req.handoff = payload;
    req.clienteId = payload.clienteId;
    return next();
  } catch (err) {
    const expired = err && err.name === 'TokenExpiredError';
    return res.status(401).json({
      error: expired ? 'El link expiró' : 'Link inválido',
      code: expired ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID',
    });
  }
};

module.exports = authenticateHandoff;
module.exports.authenticateHandoff = authenticateHandoff;
