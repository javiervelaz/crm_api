// services/email/emailService.js
//
// @deprecated Shim de compatibilidad. Usá `require('../services/email')`.
//
// La versión anterior armaba un transporte SMTP de Gmail y tenía el HTML
// embebido en un template literal. Todo eso vive ahora en el módulo:
//
//   services/email/
//     index.js       API pública (enqueue, sendNow, drain, render)
//     outbox.js      cola transaccional en Postgres
//     providers/     resend | smtp | console
//     templates/     MJML + Handlebars
//
// Este archivo queda para no romper lo que todavía lo importa. Cuando no
// quede ningún `require` apuntando acá, se borra.

const mailer = require('./index');
const { TTL_DIAS } = require('../verificacion/config');

/**
 * @deprecated Usá mailer.enqueue({ template: 'welcome', ... }, tx).
 *
 * Diferencia de comportamiento respecto de la versión vieja: esto ENCOLA, no
 * envía. Resuelve cuando el mail quedó en la cola, no cuando salió.
 */
async function sendWelcomeEmail({ to, nombreComercio, nombreContacto, plan, urlLogin, urlVerificacion, clienteId = null }) {
  await mailer.enqueue({
    template: 'welcome',
    to,
    toName: nombreContacto,
    clienteId,
    ...(clienteId && { idempotencyKey: `welcome:${clienteId}` }),
    data: {
      nombreContacto,
      nombreComercio,
      plan,
      ttlDias: TTL_DIAS,
      urlLogin,
      urlLoginTexto: String(urlLogin || '').replace(/^https?:\/\//, '').replace(/\/$/, ''),
      urlVerificacion,
    },
  });
}

module.exports = { sendWelcomeEmail };
