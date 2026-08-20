// services/email/providers/smtp.js
// Fallback / legacy. Se mantiene para poder volver a SMTP sin tocar codigo,
// cambiando EMAIL_PROVIDER=smtp. En serverless es peor que Resend: cada cold
// start paga un handshake TLS nuevo.

const { ProviderError } = require('../errors');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  // require perezoso: si nadie usa smtp, nodemailer no se carga nunca
  const nodemailer = require('nodemailer');
  const port = Number(process.env.SMTP_PORT || 587);
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return transporter;
}

async function send(message) {
  if (!process.env.SMTP_HOST) {
    throw new ProviderError('SMTP_HOST no está definida', { permanent: true, provider: 'smtp' });
  }

  try {
    const info = await getTransporter().sendMail({
      from: { name: message.fromName, address: message.fromEmail },
      to: message.toName ? { name: message.toName, address: message.toEmail } : message.toEmail,
      ...(message.replyTo && { replyTo: message.replyTo }),
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
    return { providerMessageId: info.messageId };
  } catch (err) {
    // 5xx del SMTP = rechazo definitivo del destinatario
    const permanent = typeof err.responseCode === 'number' && err.responseCode >= 500;
    throw new ProviderError(`SMTP: ${err.message}`, {
      permanent, statusCode: err.responseCode || null, provider: 'smtp',
    });
  }
}

module.exports = { name: 'smtp', send };
