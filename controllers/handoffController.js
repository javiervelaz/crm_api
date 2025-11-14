// controllers/handoffController.js
const jwt = require('jsonwebtoken');

const HANDOFF_JWT_SECRET = process.env.HANDOFF_JWT_SECRET || 'change-me';
const HANDOFF_TTL_SECONDS = parseInt(process.env.HANDOFF_TTL_SECONDS || '600', 10); // 10 min
/**
 * POST /api/handoff/sign
 * Body: { conversationId: string, waPhoneId: string, userPhoneE164?: string }
 */
const sign = async (req, res) => {
  try {
    const { conversationId, waPhoneId, userPhoneE164 } = req.body || {};
    if (!conversationId || !waPhoneId) {
      return res.status(400).json({ message: 'conversationId and waPhoneId are required' });
    }
    const token = jwt.sign({ conversationId, waPhoneId, userPhoneE164 }, HANDOFF_JWT_SECRET, {
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
  const conversationId = req.query.c;
  const token = req.query.t || req.headers['x-handoff-token'];

  if (!conversationId || !token) {
    return res.status(400).json({ message: 'Missing conversationId (c) or token (t)' });
  }

  try {
    const payload = jwt.verify(token, HANDOFF_JWT_SECRET, {
      audience: 'pwa',
      issuer: 'orders-api',
    });

    // Optional: assert token.conv matches query conv to avoid token reuse across convs
    if (payload.conversationId !== conversationId) {
      return res.status(401).json({ message: 'Conversation mismatch' });
    }

    // No DB needed: cartId virtual + sessionId = conversationId for correlation
    const cartId = `conv-${conversationId}`;
    const user = { id: null, phone: payload.userPhoneE164 || null };

    return res.json({
      sessionId: conversationId,
      user,
      cartId,
    });
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};

module.exports = { sign, resolve };
