// model/canales/db.js
const pool = require('../../pool');

// Columnas públicas: credenciales_enc y webhook_secret_hash NO están acá.
const COLS = `cc.id, cc.cliente_id, cc.provider, cc.external_id, cc.nombre, cc.status,
              cc.config, cc.created_at, cc.updated_at`;

/** Para webhooks y links públicos (sin contexto de tenant: canal_cuenta no tiene RLS). */
const getCuentaInterna = async (id) => {
  const r = await pool.query(
    `SELECT ${COLS}, cc.credenciales_enc, cc.webhook_secret_hash
       FROM canal_cuenta cc WHERE cc.id = $1`,
    [id]
  );
  return r.rows[0] || null;
};

const getCuentaPorExternal = async (provider, externalId) => {
  const r = await pool.query(
    `SELECT ${COLS} FROM canal_cuenta cc WHERE cc.provider = $1 AND cc.external_id = $2`,
    [provider, externalId]
  );
  return r.rows[0] || null;
};

const listarPorCliente = async (clienteId) => {
  const r = await pool.query(
    `SELECT ${COLS} FROM canal_cuenta cc
      WHERE cc.cliente_id = $1 AND cc.status <> 'disconnected'
      ORDER BY cc.provider, cc.created_at`,
    [clienteId]
  );
  return r.rows;
};

const getCuentaDelCliente = async (clienteId, id) => {
  const r = await pool.query(
    `SELECT ${COLS}, cc.credenciales_enc FROM canal_cuenta cc WHERE cc.cliente_id = $1 AND cc.id = $2`,
    [clienteId, id]
  );
  return r.rows[0] || null;
};

const getLinkDelCliente = async (clienteId) => {
  const r = await pool.query(
    `SELECT ${COLS} FROM canal_cuenta cc WHERE cc.cliente_id = $1 AND cc.provider = 'link'`,
    [clienteId]
  );
  return r.rows[0] || null;
};

/**
 * Alta o reconexión. Si (provider, external_id) ya existe para el MISMO
 * comercio se reactiva; si es de otro comercio, devuelve null (el caller da 409).
 */
const upsertCuenta = async ({ clienteId, provider, externalId, nombre, credencialesEnc = null, webhookSecretHash = null, config = {} }) => {
  const r = await pool.query(
    `INSERT INTO canal_cuenta AS cc
       (cliente_id, provider, external_id, nombre, credenciales_enc, webhook_secret_hash, config, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, 'active')
     ON CONFLICT (provider, external_id) DO UPDATE
       SET nombre = EXCLUDED.nombre,
           credenciales_enc = EXCLUDED.credenciales_enc,
           webhook_secret_hash = EXCLUDED.webhook_secret_hash,
           config = cc.config || EXCLUDED.config,
           status = 'active',
           updated_at = NOW()
       WHERE cc.cliente_id = EXCLUDED.cliente_id
     RETURNING ${COLS}`,
    [clienteId, provider, externalId, nombre, credencialesEnc, webhookSecretHash, JSON.stringify(config)]
  );
  return r.rows[0] || null;
};

const setStatus = async (clienteId, id, status) => {
  const r = await pool.query(
    `UPDATE canal_cuenta AS cc SET status = $3, updated_at = NOW()
      WHERE cc.cliente_id = $1 AND cc.id = $2
      RETURNING ${COLS}`,
    [clienteId, id, status]
  );
  return r.rows[0] || null;
};

/** Merge de claves en config (jsonb ||). */
const mergeConfig = async (id, patch) => {
  const r = await pool.query(
    `UPDATE canal_cuenta AS cc SET config = cc.config || $2::jsonb, updated_at = NOW()
      WHERE cc.id = $1 RETURNING ${COLS}`,
    [id, JSON.stringify(patch)]
  );
  return r.rows[0] || null;
};

/** Cuentas de avisos al dueño (Telegram con chats registrados) del comercio. */
const getCuentasAvisos = async (clienteId) => {
  const r = await pool.query(
    `SELECT cc.id, cc.credenciales_enc, cc.config
       FROM canal_cuenta cc
      WHERE cc.cliente_id = $1 AND cc.provider = 'telegram' AND cc.status = 'active'
        AND jsonb_array_length(COALESCE(cc.config->'avisos_chat_ids', '[]'::jsonb)) > 0`,
    [clienteId]
  );
  return r.rows;
};

/** Conversación por (cuenta de canal, usuario externo). */
const findOrCreateConversacion = async ({ clienteId, provider, canalCuentaId, externalUserId, telefono = null }) => {
  const upd = await pool.query(
    `UPDATE conversations
        SET updated_at = NOW(), phone_e164 = COALESCE($4, phone_e164)
      WHERE id = (
        SELECT id FROM conversations
         WHERE cliente_id = $1 AND canal_cuenta_id = $2 AND external_user_id = $3
         ORDER BY updated_at DESC LIMIT 1
      )
      RETURNING id, phone_e164`,
    [clienteId, canalCuentaId, externalUserId, telefono]
  );
  if (upd.rows[0]) return upd.rows[0];
  const ins = await pool.query(
    `INSERT INTO conversations (cliente_id, provider, canal_cuenta_id, external_user_id, phone_e164, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     RETURNING id, phone_e164`,
    [clienteId, provider, canalCuentaId, externalUserId, telefono]
  );
  return ins.rows[0];
};

module.exports = {
  getCuentaInterna,
  getCuentaPorExternal,
  listarPorCliente,
  getCuentaDelCliente,
  getLinkDelCliente,
  upsertCuenta,
  setStatus,
  mergeConfig,
  getCuentasAvisos,
  findOrCreateConversacion,
};
