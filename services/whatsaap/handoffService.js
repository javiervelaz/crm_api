// services/whatsaap/handoffService.js
//
// Token de handoff WhatsApp → micrositio. Es la ÚNICA credencial del cliente
// final: el micrositio no tiene usuario ni JWT del CRM. El tenant viaja
// adentro del token (firmado por la API), nunca en path/body.
const jwt = require('jsonwebtoken');

const ISSUER = 'orders-api';
const AUDIENCE = 'pwa';

const secret = () => {
  const s = process.env.HANDOFF_JWT_SECRET;
  if (!s) throw new Error('HANDOFF_JWT_SECRET env variable is required');
  return s;
};

const ttlSeconds = () => {
  const n = parseInt(process.env.HANDOFF_TTL_SECONDS || '3600', 10);
  return Number.isInteger(n) && n > 0 ? n : 3600;
};

const signHandoff = ({ clienteId, conversationId, waPhoneId, userPhoneE164 }) => {
  if (!Number.isInteger(clienteId) || clienteId <= 0) throw new Error('clienteId inválido');
  const expiresIn = ttlSeconds();
  const token = jwt.sign(
    { clienteId, conversationId, waPhoneId, userPhoneE164 },
    secret(),
    { expiresIn, issuer: ISSUER, audience: AUDIENCE }
  );
  return { token, expiresIn };
};

/** Lanza si el token es inválido, expiró o no es de handoff. */
const verifyHandoff = (token) => {
  const payload = jwt.verify(token, secret(), { issuer: ISSUER, audience: AUDIENCE });
  const clienteId = Number(payload.clienteId);
  if (!Number.isInteger(clienteId) || clienteId <= 0) throw new Error('Token sin tenant');
  return { ...payload, clienteId };
};

const micrositioUrl = (token) => {
  const base = (process.env.MICROSITIO_URL || 'https://app.countercrm.com/catalogo').replace(/\/+$/, '');
  return `${base}?c=${encodeURIComponent(token)}`;
};

module.exports = { signHandoff, verifyHandoff, micrositioUrl, ISSUER, AUDIENCE };
