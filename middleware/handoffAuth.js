// middleware/handoffAuth.js
const jwt = require('jsonwebtoken');
const HANDOFF_JWT_SECRET = process.env.HANDOFF_JWT_SECRET || 'change-me';

module.exports = function handoffAuth(req, res, next) {
  const token = (req.query.t) || req.headers['x-handoff-token'];
  if (!token) return res.status(401).json({ message: 'Missing token' });
  try {
    const payload = jwt.verify(token, HANDOFF_JWT_SECRET, { audience: 'pwa', issuer: 'orders-api' });
    req.handoff = payload;
    return next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};
