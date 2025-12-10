const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  tls: {
    rejectUnauthorized: false,
  },
});


async function sendWelcomeEmail({ to, nombreComercio, plan, urlLogin }) {
  const subject = '¡Tu cuenta fue creada con éxito!';
  const html = `
    <h2>¡Bienvenido a tu nuevo CRM!</h2>
    <p>Hola 👋, gracias por crear tu cuenta para <strong>${nombreComercio}</strong>.</p>
    <p>Tu plan actual es: <strong>${plan}</strong>.</p>
    <p>Ya podés ingresar desde acá:</p>
    <p><a href="${urlLogin}" target="_blank">${urlLogin}</a></p>
    <br/>
    <p>¡Éxitos en tu gestión!</p>
    <p>Equipo CRM</p>
  `;

  await transporter.sendMail({
    from: `"CRM 🍕" <${process.env.SMTP_FROM || 'no-reply@crm.com'}>`,
    to,
    subject,
    html,
  });
}

module.exports = {
  sendWelcomeEmail,
};
