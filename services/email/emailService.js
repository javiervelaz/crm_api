// services/email/emailService.js
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  // rejectUnauthorized: false deshabilita la validación del cert TLS.
  // En producción no va.
});

const FROM = `"Counter CRM" <${process.env.SMTP_FROM || 'hola@countercrm.com'}>`;

async function sendWelcomeEmail({ to, nombreComercio, nombreContacto, plan, urlLogin, urlVerificacion }) {
  const html = `
  <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:520px;margin:0 auto;color:#1e293b">
    <h2 style="color:#0f172a;margin-bottom:4px">Hola ${nombreContacto}, ya está lista tu cuenta</h2>
    <p style="color:#475569;margin-top:0">
      Creamos el espacio de <strong>${nombreComercio}</strong> en Counter. Plan <strong>${plan}</strong>.
    </p>
    <p style="margin:28px 0">
      <a href="${urlLogin}" style="background:#0f766e;color:#fff;padding:12px 28px;border-radius:10px;text-decoration:none;font-weight:600;display:inline-block">
        Entrar a Counter
      </a>
    </p>
    <p style="color:#64748b;font-size:14px">
      Confirmá tu email para que podamos ayudarte si perdés el acceso:
      <a href="${urlVerificacion}" style="color:#0f766e">confirmar mi dirección</a>
    </p>
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:28px 0"/>
    <p style="color:#94a3b8;font-size:12px">
      ¿Dudas? Respondé este mail. Counter CRM · Córdoba, Argentina
    </p>
  </div>`;

  await transporter.sendMail({
    from: FROM,
    to,
    subject: `${nombreComercio} ya está en Counter`,
    html,
    text: `Hola ${nombreContacto}, la cuenta de ${nombreComercio} ya está activa (plan ${plan}). `
        + `Entrá en ${urlLogin} — confirmá tu email en ${urlVerificacion}`,
  });
}

module.exports = { sendWelcomeEmail };