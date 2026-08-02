// services/auth/tokenService.js
const jwt = require('jsonwebtoken');

const TTL = process.env.JWT_TTL || '8h';

/**
 * Única fuente de verdad del payload del JWT.
 * Si cambia un claim, cambia acá y en ningún otro lado.
 */
function buildTokenPayload(user) {
  return {
    userId: user.id,
    cliente_id: user.cliente_id,
    username: user.name,
    role: user.role || [],
    modules: user.modules || [],
    permissions: user.permissions || {},
    sucursal: user.sucursal ?? 1,
  };
}

function issueToken(user) {
  return jwt.sign(buildTokenPayload(user), process.env.JWT_SECRET, { expiresIn: TTL });
}

module.exports = { issueToken, buildTokenPayload, TTL };