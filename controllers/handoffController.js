// controllers/handoffController.js
const { verifyHandoff } = require('../services/whatsaap/handoffService');

/**
 * POST /api/handoff/sign — RETIRADO (WA-01/WA-03).
 * Tomaba clienteId del body: cualquier JWT válido emitía links de otro
 * comercio. El reemplazo es POST /api/internal/whatsapp/handoff/sign
 * (token de servicio de n8n, tenant derivado del phone_number_id).
 */
const sign = (req, res) => res.status(410).json({
  message: 'Endpoint retirado. Usar /api/internal/whatsapp/handoff/sign',
  code: 'GONE',
});

/**
 * GET /api/handoff/resolve?c={token}  (o header x-handoff-token)
 * Valida el token del link. Público: la credencial es el propio token.
 */
const resolve = (req, res) => {
  const token = req.query.c || req.headers['x-handoff-token'];
  if (!token) {
    return res.status(400).json({ message: 'Falta el token (c)' });
  }
  try {
    const payload = verifyHandoff(token);
    const now = Math.floor(Date.now() / 1000);
    const expiresIn = payload.exp ? payload.exp - now : null;
    return res.json({
      valid: true,
      clienteId: payload.clienteId,
      userPhoneE164: payload.userPhoneE164,
      waPhoneId: payload.waPhoneId,
      conversationId: payload.conversationId,
      exp: payload.exp ?? null,
      expiresIn,
    });
  } catch (err) {
    const expired = err && err.name === 'TokenExpiredError';
    return res.status(401).json({
      valid: false,
      reason: expired ? 'expired' : 'invalid',
      message: expired ? 'Token expired' : 'Invalid token',
    });
  }
};

module.exports = { sign, resolve };
