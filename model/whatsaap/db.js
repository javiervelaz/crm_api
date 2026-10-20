const pool = require('../../pool');

// Columnas públicas de una cuenta. `access_token` NO está acá a propósito:
// nunca sale de la API (WA-05). Sólo getSendCredentials lo lee.
const ACCOUNT_COLS = `wbc.id, wbc.cliente_id, wbc.wa_phone_id, wbc.wa_display, wbc.waba_id,
       wbc.verified_name, wbc.status, wbc.created_at, wbc.updated_at`;

// ─── whatsapp_bot_cliente ─────────────────────────────────────────────────────

const createWhatsappAccount = async ({
  cliente_id,
  waba_id,
  wa_phone_id,
  wa_display,
  verified_name,
  access_token,
}) => {
  const result = await pool.query(
    `INSERT INTO whatsapp_bot_cliente AS wbc
       (cliente_id, waba_id, wa_phone_id, wa_display, verified_name, access_token, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'active')
     RETURNING ${ACCOUNT_COLS}`,
    [cliente_id, waba_id, wa_phone_id, wa_display, verified_name, access_token]
  );
  return result.rows[0];
};

/**
 * Cuenta por phone_number_id, en cualquier estado (el caller decide qué hacer
 * con suspended/disconnected). Se usa sin contexto de tenant (n8n): por eso
 * no joinea tablas con RLS.
 */
const getAccountByPhoneId = async (wa_phone_id) => {
  const result = await pool.query(
    `SELECT ${ACCOUNT_COLS}
       FROM whatsapp_bot_cliente wbc
      WHERE wbc.wa_phone_id = $1
      ORDER BY (wbc.status = 'active') DESC, wbc.updated_at DESC
      LIMIT 1`,
    [wa_phone_id]
  );
  return result.rows[0] || null;
};

const getWhatsappByClienteId = async (cliente_id) => {
  const result = await pool.query(
    `SELECT ${ACCOUNT_COLS}
       FROM whatsapp_bot_cliente wbc
      WHERE wbc.cliente_id = $1
      ORDER BY wbc.created_at DESC`,
    [cliente_id]
  );
  return result.rows;
};

/** Credenciales de envío: sólo si el número es del tenant y está activo. */
const getSendCredentials = async (cliente_id, wa_phone_id) => {
  const result = await pool.query(
    `SELECT wa_phone_id, access_token
       FROM whatsapp_bot_cliente
      WHERE cliente_id = $1 AND wa_phone_id = $2 AND status = 'active'
      LIMIT 1`,
    [cliente_id, wa_phone_id]
  );
  return result.rows[0] || null;
};

const updateWhatsappStatus = async (cliente_id, wa_phone_id, status) => {
  const result = await pool.query(
    `UPDATE whatsapp_bot_cliente AS wbc
        SET status = $1, updated_at = NOW()
      WHERE wbc.cliente_id = $2 AND wbc.wa_phone_id = $3
      RETURNING ${ACCOUNT_COLS}`,
    [status, cliente_id, wa_phone_id]
  );
  return result.rows[0];
};

// ─── cliente_whatsapp_template ────────────────────────────────────────────────

const createTemplate = async ({ cliente_id, waba_id, template_name, template_id }) => {
  const result = await pool.query(
    `INSERT INTO cliente_whatsapp_template
       (cliente_id, waba_id, template_name, template_id, status)
     VALUES ($1, $2, $3, $4, 'pending')
     ON CONFLICT DO NOTHING
     RETURNING id, cliente_id, waba_id, template_name, template_id, status, created_at`,
    [cliente_id, waba_id, template_name, template_id]
  );
  return result.rows[0];
};

const getTemplatesByClienteId = async (cliente_id) => {
  const result = await pool.query(
    `SELECT id, cliente_id, waba_id, template_name, template_id, status, created_at
       FROM cliente_whatsapp_template
      WHERE cliente_id = $1
      ORDER BY created_at DESC`,
    [cliente_id]
  );
  return result.rows;
};

// ─── whatsapp_message ─────────────────────────────────────────────────────────

const logMessage = async ({ conversation_id, wa_message_id, direction, body, raw }) => {
  const result = await pool.query(
    `INSERT INTO whatsapp_message
       (conversation_id, wa_message_id, direction, body, raw)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [conversation_id, wa_message_id, direction, body, raw ? JSON.stringify(raw) : null]
  );
  return result.rows[0];
};

// ─── conversations ────────────────────────────────────────────────────────────

const getConversationsByClienteId = async (cliente_id, { limit = 50, offset = 0 } = {}) => {
  const result = await pool.query(
    `SELECT id, wa_phone_id, phone_e164, updated_at
       FROM conversations
      WHERE cliente_id = $1
      ORDER BY updated_at DESC
      LIMIT $2 OFFSET $3`,
    [cliente_id, limit, offset]
  );
  return result.rows;
};

/**
 * Una conversación por (comercio, número, cliente final): reusa la última y
 * le actualiza updated_at. Corta la fila nueva por cada mensaje (WA-14) sin
 * necesitar todavía el unique de W1.2.
 */
const findOrCreateConversation = async ({ cliente_id, wa_phone_id, phone_e164 }) => {
  const upd = await pool.query(
    `UPDATE conversations SET updated_at = NOW()
      WHERE id = (
        SELECT id FROM conversations
         WHERE cliente_id = $1 AND wa_phone_id = $2 AND phone_e164 = $3
         ORDER BY updated_at DESC LIMIT 1
      )
      RETURNING id`,
    [cliente_id, wa_phone_id, phone_e164]
  );
  if (upd.rows[0]) return upd.rows[0].id;
  const ins = await pool.query(
    `INSERT INTO conversations (cliente_id, wa_phone_id, phone_e164, updated_at)
     VALUES ($1, $2, $3, NOW())
     RETURNING id`,
    [cliente_id, wa_phone_id, phone_e164]
  );
  return ins.rows[0].id;
};

module.exports = {
  createWhatsappAccount,
  getAccountByPhoneId,
  getWhatsappByClienteId,
  getSendCredentials,
  updateWhatsappStatus,
  createTemplate,
  getTemplatesByClienteId,
  logMessage,
  getConversationsByClienteId,
  findOrCreateConversation,
};
