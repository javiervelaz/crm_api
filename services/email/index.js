// services/email/index.js
// API pública del módulo de email. Es lo único que el resto del sistema
// necesita conocer.
//
//   const mailer = require('../services/email');
//
//   await mailer.enqueue({ template, to, data, clienteId, idempotencyKey }, tx);
//   await mailer.sendNow({ template, to, data });
//   await mailer.drain({ limit: 20 });
//   mailer.render('welcome', data);

const outbox = require('./outbox');
const { drain, startLoop } = require('./outboxWorker');
const { render, listTemplates, clearCache } = require('./renderer');
const { resolveSender } = require('./sender');
const { getProvider } = require('./providers');
const { ProviderError } = require('./errors');

/**
 * Encola un mail para envío asincrónico. Es la vía normal.
 *
 * @param {object}  params
 * @param {string}  params.template        nombre del template (sin extensión)
 * @param {string}  params.to              destinatario
 * @param {string}  [params.toName]
 * @param {number}  [params.clienteId]     tenant, null para mails de plataforma
 * @param {object}  [params.data]          variables del template
 * @param {string}  [params.idempotencyKey] evita duplicados (ej: 'welcome:42')
 * @param {string}  [params.modoRemitente] 'plataforma' (default) | 'tenant'
 * @param {Date}    [params.scheduledAt]   para envíos diferidos
 * @param {import('pg').PoolClient} [tx]   client de una transacción en curso
 */
async function enqueue(params, tx) {
  const remitente = params.fromEmail && params.fromName
    ? { fromEmail: params.fromEmail, fromName: params.fromName, replyTo: params.replyTo }
    : await resolveSender(params.clienteId, { modo: params.modoRemitente || 'plataforma' });

  return outbox.enqueue({ ...params, ...remitente }, tx);
}

/**
 * Envía sin pasar por la cola. Usar sólo cuando se necesita el resultado en el
 * mismo request. No tiene reintentos: si falla, falla.
 */
async function sendNow(params) {
  const remitente = params.fromEmail && params.fromName
    ? { fromEmail: params.fromEmail, fromName: params.fromName, replyTo: params.replyTo }
    : await resolveSender(params.clienteId, { modo: params.modoRemitente || 'plataforma' });

  const { subject, html, text } = render(params.template, params.data || {});
  const provider = getProvider();

  return provider.send({
    toEmail: String(params.to).trim().toLowerCase(),
    toName: params.toName || null,
    ...remitente,
    idempotencyKey: params.idempotencyKey || null,
    subject, html, text,
  });
}

module.exports = {
  enqueue,
  sendNow,
  drain,
  render,
  startLoop,
  resolveSender,
  listTemplates,
  stats: outbox.stats,
  clearCache,
  ProviderError,
};
