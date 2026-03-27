const pool = require('../../pool');

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
    `INSERT INTO whatsapp_bot_cliente
       (cliente_id, waba_id, wa_phone_id, wa_display, verified_name, access_token, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'active')
     RETURNING *`,
    [cliente_id, waba_id, wa_phone_id, wa_display, verified_name, access_token]
  );
  return result.rows[0];
};

const getWhatsappByPhoneId = async (wa_phone_id) => {
  const result = await pool.query(
    `SELECT wbc.*, c.nombre AS cliente_nombre
     FROM whatsapp_bot_cliente wbc
     JOIN cliente c ON c.id = wbc.cliente_id
     WHERE wbc.wa_phone_id = $1 AND wbc.status = 'active'`,
    [wa_phone_id]
  );
  return result.rows[0] || null;
};

const getWhatsappByClienteId = async (cliente_id) => {
  const result = await pool.query(
    `SELECT * FROM whatsapp_bot_cliente WHERE cliente_id = $1 ORDER BY created_at DESC`,
    [cliente_id]
  );
  return result.rows;
};

const updateWhatsappStatus = async (wa_phone_id, status) => {
  const result = await pool.query(
    `UPDATE whatsapp_bot_cliente
     SET status = $1, updated_at = NOW()
     WHERE wa_phone_id = $2
     RETURNING *`,
    [status, wa_phone_id]
  );
  return result.rows[0];
};

const deleteWhatsappAccount = async (wa_phone_id) => {
  const result = await pool.query(
    `DELETE FROM whatsapp_bot_cliente WHERE wa_phone_id = $1 RETURNING *`,
    [wa_phone_id]
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
     RETURNING *`,
    [cliente_id, waba_id, template_name, template_id]
  );
  return result.rows[0];
};

const getTemplatesByClienteId = async (cliente_id) => {
  const result = await pool.query(
    `SELECT * FROM cliente_whatsapp_template WHERE cliente_id = $1 ORDER BY created_at DESC`,
    [cliente_id]
  );
  return result.rows;
};

// ─── whatsapp_message (tabla existente en la DB) ──────────────────────────────

const logMessage = async ({
  conversation_id,
  wa_message_id,
  direction,   // 'inbound' | 'outbound'
  body,
  raw,
}) => {
  const result = await pool.query(
    `INSERT INTO whatsapp_message
       (conversation_id, wa_message_id, direction, body, raw)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [conversation_id, wa_message_id, direction, body, raw ? JSON.stringify(raw) : null]
  );
  return result.rows[0];
};

const getMessagesByConversationId = async (conversation_id, { limit = 50, offset = 0 } = {}) => {
  const result = await pool.query(
    `SELECT * FROM whatsapp_message
     WHERE conversation_id = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [conversation_id, limit, offset]
  );
  return result.rows;
};

// ─── conversations (tabla existente en la DB) ─────────────────────────────────

const getConversationsByClienteId = async (cliente_id, { limit = 50, offset = 0 } = {}) => {
  const result = await pool.query(
    `SELECT * FROM conversations
     WHERE cliente_id = $1
     ORDER BY updated_at DESC
     LIMIT $2 OFFSET $3`,
    [cliente_id, limit, offset]
  );
  return result.rows;
};

module.exports = {
  createWhatsappAccount,
  getWhatsappByPhoneId,
  getWhatsappByClienteId,
  updateWhatsappStatus,
  deleteWhatsappAccount,
  createTemplate,
  getTemplatesByClienteId,
  logMessage,
  getMessagesByConversationId,
  getConversationsByClienteId,
};
