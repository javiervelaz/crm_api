// services/email/sender.js
// Resuelve quien firma el mail.

const pool = require('../../pool');

const DEFAULT_FROM_EMAIL = process.env.EMAIL_FROM || 'info@countercrm.com';
const DEFAULT_FROM_NAME = process.env.EMAIL_FROM_NAME || 'Counter';
const DEFAULT_REPLY_TO = process.env.EMAIL_REPLY_TO || DEFAULT_FROM_EMAIL;

/**
 * Devuelve el remitente para un tenant.
 *
 * Hoy todo sale como "Counter <info@countercrm.com>". La forma queda armada
 * para cuando el CRM mande mails al cliente final del comercio: ahi el nombre
 * pasa a ser "Panaderia La Esquina via Counter" y el Reply-To al mail del
 * comercio.
 *
 * El From NUNCA lleva el dominio del comercio: countercrm.com es el unico
 * dominio con SPF/DKIM/DMARC. Firmar con otro dominio rompe DMARC y quema la
 * reputacion de envio.
 */
async function resolveSender(clienteId, { modo = 'plataforma' } = {}) {
  const base = {
    fromEmail: DEFAULT_FROM_EMAIL,
    fromName: DEFAULT_FROM_NAME,
    replyTo: DEFAULT_REPLY_TO,
  };

  if (modo === 'plataforma' || !clienteId) return base;

  // modo 'tenant': mails que el comercio manda a SUS clientes
  try {
    const { rows } = await pool.query(
      'SELECT nombre, contacto_email FROM cliente WHERE id = $1',
      [clienteId]
    );
    const cliente = rows[0];
    if (!cliente) return base;

    return {
      fromEmail: DEFAULT_FROM_EMAIL,
      fromName: `${cliente.nombre} vía Counter`,
      replyTo: cliente.contacto_email || DEFAULT_REPLY_TO,
    };
  } catch (err) {
    // Un fallo resolviendo el remitente no puede impedir el envio
    console.error('[email/sender] fallback a remitente de plataforma:', err.message);
    return base;
  }
}

module.exports = { resolveSender, DEFAULT_FROM_EMAIL, DEFAULT_FROM_NAME, DEFAULT_REPLY_TO };
