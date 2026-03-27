const db = require('../../model/whatsaap/db');

const META_API_VERSION  = 'v22.0';
const META_BASE_URL     = `https://graph.facebook.com/${META_API_VERSION}`;
const META_WABA_ID      = process.env.META_WABA_ID;
const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;

// ─── Helpers Meta API ─────────────────────────────────────────────────────────

const metaPost = async (url, body, token = META_ACCESS_TOKEN) => {
  const res = await fetch(`${META_BASE_URL}${url}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw { status: res.status, meta: data };
  return data;
};

const metaGet = async (url, token = META_ACCESS_TOKEN) => {
  const res = await fetch(`${META_BASE_URL}${url}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw { status: res.status, meta: data };
  return data;
};

// ─── Alta de número ───────────────────────────────────────────────────────────

/**
 * Paso 1 — Pedir SMS a Meta.
 * Devuelve { id: phone_number_id, ... }
 */
const requestVerificationCode = async ({ cc, phone_number, verified_name, method = 'SMS' }) => {
  try {
    // Intenta agregar el número (caso nuevo)
    return await metaPost(`/${META_WABA_ID}/phone_numbers`, {
      cc, phone_number, verified_name, method,
    });
  } catch (err) {
    // Si ya existe, reenvía el código al número existente
    const existingId = err?.meta?.error?.error_data?.phone_number_id;
    if (existingId) {
      await metaPost(`/${existingId}/request_code`, {
        code_method: method,
        language: 'es',
      });
      return { id: existingId };
    }
    throw err;
  }
};

/**
 * Paso 2 — Verificar el código SMS.
 */
const verifyCode = async (wa_phone_id, code) => {
  return metaPost(`/${wa_phone_id}/verify_code`, { code });
};

/**
 * Paso 3 — Registrar en Cloud API + guardar en DB + crear template.
 * Llamar luego de verify_code exitoso.
 */
const activateWhatsappNumber = async ({
  cliente_id,
  wa_phone_id,
  verified_name,
  wa_display,
  pin = '000000',
}) => {
  // Registrar en Cloud API
  await metaPost(`/${wa_phone_id}/register`, {
    messaging_product: 'whatsapp',
    pin,
  });

  // Guardar en whatsapp_bot_cliente
  const account = await db.createWhatsappAccount({
    cliente_id,
    waba_id:       META_WABA_ID,
    wa_phone_id,
    wa_display,
    verified_name,
    access_token:  META_ACCESS_TOKEN,
  });

  // Crear template mostrar_catalogo automáticamente
  await createMostrarCatalogoTemplate(cliente_id, META_WABA_ID);

  return account;
};

// ─── Templates ───────────────────────────────────────────────────────────────

const MOSTRAR_CATALOGO_TEMPLATE = {
  name: 'mostrar_catalogo',
  language: 'es',
  category: 'MARKETING',
  components: [
    {
      type: 'HEADER',
      format: 'TEXT',
      text: 'Pedidos por Whatsaap',
    },
    {
      type: 'BODY',
      text: 'Hola, estas listo para hacer tu pedido?',
    },
    {
      type: 'FOOTER',
      text: 'Counter CRM',
    },
    {
      type: 'BUTTONS',
      buttons: [
        {
          type: 'URL',
          text: 'Visit website',
          url: 'https://crm-ui-omega-swart.vercel.app/catalogo?c={{1}}',
          example: ['https://crm-ui-omega-swart.vercel.app/catalogo?c=TOKEN_EJEMPLO'],
        },
      ],
    },
  ],
};

const createMostrarCatalogoTemplate = async (cliente_id, waba_id) => {
  try {
    const data = await metaPost(`/${waba_id}/message_templates`, MOSTRAR_CATALOGO_TEMPLATE);
    await db.createTemplate({
      cliente_id,
      waba_id,
      template_name: 'mostrar_catalogo',
      template_id:   data.id,
    });
    return data;
  } catch (err) {
    // Template ya existente no es error crítico
    console.warn('[WA] Template ya existe:', err?.meta?.error?.message);
    return null;
  }
};

const getTemplatesFromMeta = async (waba_id) => {
  return metaGet(`/${waba_id}/message_templates`);
};

// ─── Envío de mensajes ────────────────────────────────────────────────────────

const sendTextMessage = async ({ wa_phone_id, to, body }) => {
  return metaPost(`/${wa_phone_id}/messages`, {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { body },
  });
};

const sendTemplateMessage = async ({
  wa_phone_id,
  to,
  template_name,
  language   = 'es',
  components = [],
}) => {
  return metaPost(`/${wa_phone_id}/messages`, {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'template',
    template: {
      name: template_name,
      language: { code: language },
      components,
    },
  });
};

// ─── Resolución de cliente por wa_phone_id (para n8n) ────────────────────────

const resolveClienteByPhoneId = async (wa_phone_id) => {
  const account = await db.getWhatsappByPhoneId(wa_phone_id);
  if (!account) return null;
  return {
    cliente_id:     account.cliente_id,
    cliente_nombre: account.cliente_nombre,
    waba_id:        account.waba_id,
    wa_phone_id:    account.wa_phone_id,
    wa_display:     account.wa_display,
    access_token:   account.access_token,
  };
};

// ─── Listados ─────────────────────────────────────────────────────────────────

const getAccountsByClienteId       = (cliente_id)             => db.getWhatsappByClienteId(cliente_id);
const getTemplatesByClienteId      = (cliente_id)             => db.getTemplatesByClienteId(cliente_id);
const getConversationsByClienteId  = (cliente_id, opts)       => db.getConversationsByClienteId(cliente_id, opts);
const getMessagesByConversationId  = (conversation_id, opts)  => db.getMessagesByConversationId(conversation_id, opts);

module.exports = {
  requestVerificationCode,
  verifyCode,
  activateWhatsappNumber,
  createMostrarCatalogoTemplate,
  getTemplatesFromMeta,
  sendTextMessage,
  sendTemplateMessage,
  resolveClienteByPhoneId,
  getAccountsByClienteId,
  getTemplatesByClienteId,
  getConversationsByClienteId,
  getMessagesByConversationId,
};
