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
    tipo: user.tipo ?? null,
    debeCambiarPassword: user.debeCambiarPassword === true,
  };
}

function issueToken(user) {
  return jwt.sign(buildTokenPayload(user), process.env.JWT_SECRET, { expiresIn: TTL });
}

/**
 * Token con los datos actuales del usuario pero el MISMO vencimiento que el
 * anterior (refresco de permisos). Refrescar no alarga la sesión: sigue
 * venciendo a las TTL del login, como siempre.
 */
function reissueToken(user, exp) {
  const ahora = Math.floor(Date.now() / 1000);
  if (!Number.isInteger(exp) || exp <= ahora) throw new Error('reissueToken: vencimiento inválido');
  return jwt.sign({ ...buildTokenPayload(user), exp }, process.env.JWT_SECRET);
}

module.exports = { issueToken, reissueToken, buildTokenPayload, TTL };