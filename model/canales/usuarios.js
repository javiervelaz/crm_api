// model/canales/usuarios.js — vinculación chat de bot ↔ usuario de Counter
const pool = require('../../pool');

// Externos de la academia (profesor, tutor, alumno): no son staff del comercio
const TIPOS_EXTERNOS = ['PROF', 'TUT', 'ALU'];

const crearVinculacion = async ({ codigoHash, clienteId, userId, canalCuentaId, ttlSegundos }) => {
  // Un código vivo por usuario y bot: los anteriores sin usar se invalidan
  await pool.query(
    `UPDATE canal_vinculacion SET usado_at = NOW()
      WHERE canal_cuenta_id = $1 AND user_id = $2 AND usado_at IS NULL`,
    [canalCuentaId, userId]
  );
  await pool.query(
    `INSERT INTO canal_vinculacion (codigo_hash, cliente_id, user_id, canal_cuenta_id, expira_at)
     VALUES ($1, $2, $3, $4, NOW() + make_interval(secs => $5))`,
    [codigoHash, clienteId, userId, canalCuentaId, ttlSegundos]
  );
};

/** Consume el código (una sola vez). Devuelve { cliente_id, user_id } o null. */
const consumirVinculacion = async (codigoHash, canalCuentaId) => {
  const r = await pool.query(
    `UPDATE canal_vinculacion SET usado_at = NOW()
      WHERE codigo_hash = $1 AND canal_cuenta_id = $2
        AND usado_at IS NULL AND expira_at > NOW()
      RETURNING cliente_id, user_id`,
    [codigoHash, canalCuentaId]
  );
  return r.rows[0] || null;
};

/**
 * Vincula el chat al usuario. Si el usuario ya tenía otro chat en este bot,
 * se reemplaza; si el chat estaba vinculado a otro usuario, pasa a este.
 */
const vincular = async ({ clienteId, userId, canalCuentaId, chatId }) => {
  await pool.query(
    `DELETE FROM canal_usuario
      WHERE canal_cuenta_id = $1 AND (chat_id = $2 OR user_id = $3)`,
    [canalCuentaId, chatId, userId]
  );
  const r = await pool.query(
    `INSERT INTO canal_usuario (cliente_id, user_id, canal_cuenta_id, chat_id, ultimo_uso_at)
     VALUES ($1, $2, $3, $4, NOW())
     RETURNING id, avisos, created_at`,
    [clienteId, userId, canalCuentaId, chatId]
  );
  return r.rows[0];
};

/**
 * Usuario dueño de un chat, sólo si sigue siendo staff activo del comercio.
 * Trae los módulos para que el que llame decida qué puede ver.
 */
const getUsuarioDelChat = async (canalCuentaId, chatId) => {
  const r = await pool.query(
    `SELECT cu.id AS vinculo_id, cu.user_id, cu.cliente_id, cu.avisos,
            u.nombre, u.apellido, u.deleted_at, ut.codigo AS tipo,
            COALESCE((
              SELECT array_agg(DISTINCT m.codigo)
                FROM user_rol ur
                JOIN modulo_rol mr ON mr.id_rol = ur.id_rol AND mr.cliente_id = ur.cliente_id
                JOIN modulo m      ON m.id = mr.id_modulo AND m.cliente_id = mr.cliente_id
               WHERE ur.id_user = u.id AND ur.cliente_id = u.cliente_id
                 AND m.status = true AND m.deleted_at IS NULL
            ), '{}') AS modulos
       FROM canal_usuario cu
       JOIN "user" u ON u.id = cu.user_id AND u.cliente_id = cu.cliente_id
       LEFT JOIN user_type ut ON ut.id = u.user_type_id
      WHERE cu.canal_cuenta_id = $1 AND cu.chat_id = $2`,
    [canalCuentaId, chatId]
  );
  return r.rows[0] || null;
};

const tocarUso = async (vinculoId) => {
  await pool.query('UPDATE canal_usuario SET ultimo_uso_at = NOW() WHERE id = $1', [vinculoId]);
};

const desvincularPorId = async (clienteId, vinculoId) => {
  const r = await pool.query(
    'DELETE FROM canal_usuario WHERE cliente_id = $1 AND id = $2 RETURNING id',
    [clienteId, vinculoId]
  );
  return r.rows.length > 0;
};

const desvincularUsuario = async (clienteId, userId, canalCuentaId) => {
  const r = await pool.query(
    'DELETE FROM canal_usuario WHERE cliente_id = $1 AND user_id = $2 AND canal_cuenta_id = $3 RETURNING id',
    [clienteId, userId, canalCuentaId]
  );
  return r.rows.length > 0;
};

const getVinculoDeUsuario = async (clienteId, userId, canalCuentaId) => {
  const r = await pool.query(
    `SELECT id, avisos, created_at, ultimo_uso_at FROM canal_usuario
      WHERE cliente_id = $1 AND user_id = $2 AND canal_cuenta_id = $3`,
    [clienteId, userId, canalCuentaId]
  );
  return r.rows[0] || null;
};

const setAvisos = async (clienteId, userId, canalCuentaId, avisos) => {
  const r = await pool.query(
    `UPDATE canal_usuario SET avisos = $4
      WHERE cliente_id = $1 AND user_id = $2 AND canal_cuenta_id = $3
      RETURNING id, avisos, created_at, ultimo_uso_at`,
    [clienteId, userId, canalCuentaId, avisos]
  );
  return r.rows[0] || null;
};

/** Para el admin: quiénes tienen vinculado el bot. Sin chat_id. */
const listarVinculados = async (clienteId, canalCuentaId) => {
  const r = await pool.query(
    `SELECT cu.id, cu.user_id, cu.avisos, cu.created_at, cu.ultimo_uso_at,
            TRIM(CONCAT(u.nombre, ' ', u.apellido)) AS nombre,
            EXISTS (
              SELECT 1 FROM user_rol ur
                JOIN modulo_rol mr ON mr.id_rol = ur.id_rol AND mr.cliente_id = ur.cliente_id
                JOIN modulo m      ON m.id = mr.id_modulo AND m.cliente_id = mr.cliente_id
               WHERE ur.id_user = u.id AND ur.cliente_id = u.cliente_id
                 AND m.codigo = 'operaciones' AND m.status = true AND m.deleted_at IS NULL
            ) AS acceso_pedidos
       FROM canal_usuario cu
       JOIN "user" u ON u.id = cu.user_id AND u.cliente_id = cu.cliente_id
       LEFT JOIN user_type ut ON ut.id = u.user_type_id
      WHERE cu.cliente_id = $1 AND cu.canal_cuenta_id = $2
        AND u.deleted_at IS NULL AND COALESCE(ut.codigo, '') <> ALL($3::text[])
      ORDER BY cu.created_at`,
    [clienteId, canalCuentaId, TIPOS_EXTERNOS]
  );
  return r.rows;
};

/**
 * Destinatarios de los avisos de pedidos: chats con avisos prendidos de
 * usuarios activos, staff, con el módulo de pedidos (operaciones), en bots
 * de Telegram activos del comercio. Se calcula en cada pedido: sacarle el
 * módulo o dar de baja al usuario corta los avisos al instante.
 */
const getDestinatariosAvisos = async (clienteId) => {
  const r = await pool.query(
    `SELECT cu.chat_id, cc.id AS canal_cuenta_id, cc.credenciales_enc
       FROM canal_usuario cu
       JOIN canal_cuenta cc ON cc.id = cu.canal_cuenta_id AND cc.cliente_id = cu.cliente_id
       JOIN "user" u        ON u.id = cu.user_id AND u.cliente_id = cu.cliente_id
       LEFT JOIN user_type ut ON ut.id = u.user_type_id
      WHERE cu.cliente_id = $1 AND cu.avisos = TRUE
        AND cc.provider = 'telegram' AND cc.status = 'active'
        AND u.deleted_at IS NULL
        AND COALESCE(ut.codigo, '') <> ALL($2::text[])
        AND EXISTS (
          SELECT 1 FROM user_rol ur
            JOIN modulo_rol mr ON mr.id_rol = ur.id_rol AND mr.cliente_id = ur.cliente_id
            JOIN modulo m      ON m.id = mr.id_modulo AND m.cliente_id = mr.cliente_id
           WHERE ur.id_user = u.id AND ur.cliente_id = u.cliente_id
             AND m.codigo = 'operaciones' AND m.status = true AND m.deleted_at IS NULL
        )`,
    [clienteId, TIPOS_EXTERNOS]
  );
  return r.rows;
};

module.exports = {
  TIPOS_EXTERNOS,
  crearVinculacion,
  consumirVinculacion,
  vincular,
  getUsuarioDelChat,
  tocarUso,
  desvincularPorId,
  desvincularUsuario,
  getVinculoDeUsuario,
  setAvisos,
  listarVinculados,
  getDestinatariosAvisos,
};
