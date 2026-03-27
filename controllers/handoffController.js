// controllers/handoffController.js
const jwt = require('jsonwebtoken');

const HANDOFF_JWT_SECRET = process.env.HANDOFF_JWT_SECRET;
if (!HANDOFF_JWT_SECRET) throw new Error('HANDOFF_JWT_SECRET env variable is required');
const HANDOFF_TTL_SECONDS = parseInt(process.env.HANDOFF_TTL_SECONDS || '600', 10); // 10 min
/**
 * POST /api/handoff/sign
 * Body: { conversationId: string, waPhoneId: string, userPhoneE164?: string }
 */
const sign = async (req, res) => {
  try {
    const { clienteId,conversationId, waPhoneId, userPhoneE164 } = req.body || {};
    if (!conversationId || !waPhoneId) {
      return res.status(400).json({ message: 'conversationId and waPhoneId are required' });
    }
    const token = jwt.sign({ clienteId,conversationId, waPhoneId, userPhoneE164 }, HANDOFF_JWT_SECRET, {
      expiresIn: HANDOFF_TTL_SECONDS,
      issuer: 'orders-api',
      audience: 'pwa',
    });
    return res.json({ token, expiresIn: HANDOFF_TTL_SECONDS });
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Error signing handoff token' });
  }
};

/**
 * GET /api/handoff/resolve?c={conversationId}&t={jwt}
 * Returns: { sessionId, user: { id, phone }, cartId }
 */
const resolve = async (req, res) => {

  const token = req.query.c || req.headers['x-handoff-token'];
  if ( !token) {
    return res.status(400).json({ message: 'Missing conversationId (c) or token (t)' });
  }

  try {
    const payload = jwt.verify(token, HANDOFF_JWT_SECRET, {
      clienteId: 'clienteId',
      conversationId: 'conversationId',
      waPhoneId: 'waPhoneId',
      userPhoneE164:'userPhoneE164',
    });
    const now = Math.floor(Date.now() / 1000);
    let expiresIn = null;
    if(payload.exp){
      expiresIn = payload.exp  - now;
       if (expiresIn <= 0) {
        return res.status(401).json({
          valid: false,
          reason: 'expired',
          message: 'Token expired',
        });
      }
    }

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
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};



module.exports = { sign, resolve };
