const db = require('../../model/whatsaap/db');

// El flujo viejo de alta por SMS sobre la WABA de Counter (request_code /
// verify_code / register + template MARKETING) se retiró en W0 (WA-12/WA-16).
// El alta nueva es Embedded Signup v4 + Coexistence (W2).

const graphBase = () => `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || 'v22.0'}`;

const httpError = (status, message, code, meta) => {
  const err = new Error(message);
  err.status = status;
  if (code) err.code = code;
  if (meta) err.meta = meta;
  return err;
};

const metaPost = async (path, body, token) => {
  if (!token) throw httpError(500, 'Sin token de Meta para este número', 'NO_META_TOKEN');
  const res = await fetch(`${graphBase()}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  if (!res.ok) {
    // Del error de Meta sólo devolvemos el mensaje; el objeto entero puede
    // traer fbtrace_id y detalles internos.
    throw httpError(502, data?.error?.message || `Meta respondió ${res.status}`, 'META_ERROR');
  }
  return data;
};

// ─── Credenciales por tenant ──────────────────────────────────────────────────

/**
 * El número tiene que ser del tenant y estar activo (WA-07). Devuelve el token
 * a usar: el de la cuenta (W2, cada comercio el suyo) o, mientras tanto, el
 * global de Counter. El token jamás sale de este service.
 */
const getCredencialesEnvio = async (cliente_id, wa_phone_id) => {
  if (!wa_phone_id) throw httpError(400, 'phone_number_id es requerido', 'INVALID_PARAM');
  const cuenta = await db.getSendCredentials(cliente_id, String(wa_phone_id));
  if (!cuenta) throw httpError(403, 'El número no pertenece a este comercio o no está activo', 'WA_NUMBER_FORBIDDEN');
  return { wa_phone_id: cuenta.wa_phone_id, token: cuenta.access_token || process.env.META_ACCESS_TOKEN };
};

// ─── Envío de mensajes ────────────────────────────────────────────────────────

const sendTextMessage = async ({ cliente_id, wa_phone_id, to, body }) => {
  const cred = await getCredencialesEnvio(cliente_id, wa_phone_id);
  return metaPost(`/${cred.wa_phone_id}/messages`, {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { body },
  }, cred.token);
};

const sendTemplateMessage = async ({ cliente_id, wa_phone_id, to, template_name, language = 'es', components = [] }) => {
  const cred = await getCredencialesEnvio(cliente_id, wa_phone_id);
  return metaPost(`/${cred.wa_phone_id}/messages`, {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'template',
    template: { name: template_name, language: { code: language }, components },
  }, cred.token);
};

/**
 * Mensaje interactivo con botón a URL. Dentro de la ventana de 24 h es gratis
 * y no necesita template aprobado (WA-13). display_text: máx. 20 caracteres.
 */
const buildCtaUrlPayload = ({ to, body, url, button = 'Hacer mi pedido', footer = 'Counter CRM' }) => ({
  messaging_product: 'whatsapp',
  recipient_type: 'individual',
  to,
  type: 'interactive',
  interactive: {
    type: 'cta_url',
    body: { text: body },
    footer: { text: footer },
    action: { name: 'cta_url', parameters: { display_text: button.slice(0, 20), url } },
  },
});

const sendCtaUrlMessage = async ({ cliente_id, wa_phone_id, ...rest }) => {
  const cred = await getCredencialesEnvio(cliente_id, wa_phone_id);
  return metaPost(`/${cred.wa_phone_id}/messages`, buildCtaUrlPayload(rest), cred.token);
};

// ─── Listados (siempre del tenant del request) ───────────────────────────────

const getAccountsByClienteId = (cliente_id) => db.getWhatsappByClienteId(cliente_id);
const getTemplatesByClienteId = (cliente_id) => db.getTemplatesByClienteId(cliente_id);
const getConversationsByClienteId = (cliente_id, opts) => db.getConversationsByClienteId(cliente_id, opts);

module.exports = {
  getCredencialesEnvio,
  sendTextMessage,
  sendTemplateMessage,
  sendCtaUrlMessage,
  buildCtaUrlPayload,
  getAccountsByClienteId,
  getTemplatesByClienteId,
  getConversationsByClienteId,
};
