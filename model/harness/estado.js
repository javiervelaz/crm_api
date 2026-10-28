// model/harness/estado.js — estado de conversación (migración 023).
// Toda consulta filtra por cliente_id ($1) además del chat: sin RLS en prod.

const pool = require('../../pool');

/** Estado vigente del chat, o null (inexistente o vencido). */
const cargar = async (clienteId, canalCuentaId, chatId) => {
  const { rows } = await pool.query(
    `SELECT intent, params, user_id FROM harness_estado
      WHERE cliente_id = $1 AND canal_cuenta_id = $2 AND chat_id = $3 AND expira_at > now()`,
    [clienteId, canalCuentaId, String(chatId)],
  );
  return rows[0] || null;
};

const guardar = async (clienteId, canalCuentaId, chatId, { userId, intent, params, ttlSegundos }) => {
  await pool.query(
    `INSERT INTO harness_estado (cliente_id, canal_cuenta_id, chat_id, user_id, intent, params, expira_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, now() + ($7 || ' seconds')::interval, now())
     ON CONFLICT (cliente_id, canal_cuenta_id, chat_id)
     DO UPDATE SET user_id = EXCLUDED.user_id, intent = EXCLUDED.intent, params = EXCLUDED.params,
                   expira_at = EXCLUDED.expira_at, updated_at = now()`,
    [clienteId, canalCuentaId, String(chatId), userId ?? null, intent, JSON.stringify(params || {}), String(ttlSegundos)],
  );
};

module.exports = { cargar, guardar };
