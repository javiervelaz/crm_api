// services/email/providers/resend.js
// Cliente HTTP directo contra la API de Resend. Sin SDK: Node 22 ya trae
// fetch global y el endpoint es un POST con JSON. Una dependencia menos.

const { ProviderError } = require('../errors');

const ENDPOINT = 'https://api.resend.com/emails';
const TIMEOUT_MS = Number(process.env.EMAIL_HTTP_TIMEOUT_MS || 10_000);

function formatAddress(name, email) {
  return name ? `${name} <${email}>` : email;
}

async function send(message) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // Falta de config, no falla transitoria: reintentar no lo va a arreglar.
    throw new ProviderError('RESEND_API_KEY no está definida', {
      permanent: true, provider: 'resend',
    });
  }

  const body = {
    from: formatAddress(message.fromName, message.fromEmail),
    to: [formatAddress(message.toName, message.toEmail)],
    subject: message.subject,
    html: message.html,
    text: message.text,
  };
  if (message.replyTo) body.reply_to = message.replyTo;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        // Resend deduplica del lado suyo si repetimos la key
        ...(message.idempotencyKey && { 'Idempotency-Key': message.idempotencyKey }),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    // Timeout o red caida: transitorio, va a reintento
    throw new ProviderError(`Resend inalcanzable: ${err.message}`, {
      permanent: false, provider: 'resend',
    });
  } finally {
    clearTimeout(timer);
  }

  const raw = await res.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch { /* respuesta no-JSON */ }

  if (!res.ok) {
    // 4xx = problema del mensaje (destinatario invalido, dominio no
    // verificado, payload mal). Reintentarlo no cambia nada.
    // 429 es la excepcion: es rate limit, si conviene reintentar.
    const permanent = res.status >= 400 && res.status < 500 && res.status !== 429;
    throw new ProviderError(
      `Resend ${res.status}: ${data.message || data.name || raw.slice(0, 200)}`,
      { permanent, statusCode: res.status, provider: 'resend' }
    );
  }

  if (!data.id) {
    throw new ProviderError('Resend respondió 200 sin id de mensaje', {
      permanent: false, provider: 'resend',
    });
  }

  return { providerMessageId: data.id };
}

module.exports = { name: 'resend', send };
