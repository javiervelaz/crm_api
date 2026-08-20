// services/email/providers/console.js
// Provider de desarrollo y tests: no manda nada, escribe a stdout.
// Es el default cuando NODE_ENV !== 'production', para que nadie mande
// pruebas a clientes reales por tener el .env mal.

let counter = 0;

async function send(message) {
  counter += 1;
  const id = `console-${Date.now()}-${counter}`;

  console.log(
    [
      '',
      '─────────────── EMAIL (console provider) ───────────────',
      `De:      ${message.fromName} <${message.fromEmail}>`,
      `Para:    ${message.toName ? `${message.toName} <${message.toEmail}>` : message.toEmail}`,
      message.replyTo ? `ReplyTo: ${message.replyTo}` : null,
      `Asunto:  ${message.subject}`,
      '────────────────────── texto ──────────────────────────',
      message.text,
      `──────────────── html: ${message.html.length} bytes ────────────────`,
      '',
    ].filter(Boolean).join('\n')
  );

  return { providerMessageId: id };
}

module.exports = { name: 'console', send };
