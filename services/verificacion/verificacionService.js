// services/verificacion/verificacionService.js
// Verificacion de email y activacion de cuenta.

const crypto = require('crypto');
const pool = require('../../pool');
const mailer = require('../email');
const { ESTADOS } = require('./estados');
const { TTL_DIAS, BLOQUEO_DIAS } = require('./config');

const FORMATO_TOKEN = /^[a-f0-9]{64}$/;

class VerificacionError extends Error {
  constructor(message, { status = 400, code = 'VERIFICACION_ERROR' } = {}) {
    super(message);
    this.name = 'VerificacionError';
    this.status = status;
    this.code = code;
  }
}

function nuevoToken() {
  return crypto.randomBytes(32).toString('hex');
}

function urlVerificacion(token) {
  return `${process.env.PLATFORM_BASE_URL}/auth/verificar?token=${token}`;
}

/**
 * Encola el mail de verificacion. Si se pasa `tx`, entra en esa transaccion.
 * `template` permite reusar esto tanto para el welcome del alta como para el
 * reenvio, que es mas seco.
 */
async function encolarMailVerificacion(
  { clienteId, email, nombreContacto, nombreComercio, plan, token, template = 'verify', idempotencyKey = null },
  tx
) {
  return mailer.enqueue({
    template,
    to: email,
    toName: nombreContacto,
    clienteId,
    idempotencyKey,
    data: {
      nombreContacto,
      nombreComercio,
      plan,
      ttlDias: TTL_DIAS,
      urlVerificacion: urlVerificacion(token),
      urlLogin: `${process.env.PLATFORM_BASE_URL}/`,
      urlLoginTexto: String(process.env.PLATFORM_BASE_URL || '').replace(/^https?:\/\//, ''),
    },
  }, tx);
}

/**
 * Verifica el token y activa la cuenta.
 *
 * Todo corre en una transaccion: marcar el token usado y activar el cliente
 * son una sola operacion o ninguna.
 *
 * @returns {Promise<{clienteId:number, userId:number, email:string, yaEstabaActivo:boolean}>}
 */
async function verificar(token) {
  if (!FORMATO_TOKEN.test(String(token || ''))) {
    throw new VerificacionError('Token inválido', { code: 'INVALID_TOKEN' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT cliente_id, user_id, email
         FROM email_verification
        WHERE token = $1 AND used_at IS NULL AND expires_at > now()
        FOR UPDATE`,
      [token]
    );

    if (!rows[0]) {
      await client.query('ROLLBACK');
      throw new VerificacionError('El enlace expiró o ya fue usado', { code: 'TOKEN_EXPIRED' });
    }

    const { cliente_id: clienteId, user_id: userId, email } = rows[0];

    await client.query('UPDATE email_verification SET used_at = now() WHERE token = $1', [token]);

    // El AND estado = PENDIENTE evita que un link viejo reactive una cuenta
    // que suspendiste a mano. Si ya estaba ACTIVO, rowCount = 0 y no pasa nada.
    const activacion = await client.query(
      `UPDATE cliente
          SET estado = $2, email_verificado_at = COALESCE(email_verificado_at, now()), updated_at = now()
        WHERE id = $1 AND estado = $3
        RETURNING id`,
      [clienteId, ESTADOS.ACTIVO, ESTADOS.PENDIENTE]
    );

    await client.query('COMMIT');

    return { clienteId, userId, email, yaEstabaActivo: activacion.rowCount === 0 };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Reenvia el link de verificacion.
 *
 * SIEMPRE resuelve sin error, exista o no el email. Responder 404 cuando la
 * cuenta no existe convierte este endpoint en un enumerador de clientes:
 * cualquiera prueba direcciones y sabe cuales estan registradas.
 *
 * @returns {Promise<{enviado:boolean}>} solo para logs, nunca para el body
 */
async function reenviar(emailCrudo) {
  const email = String(emailCrudo || '').trim().toLowerCase();
  if (!email) return { enviado: false };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT c.id            AS cliente_id,
              c.nombre        AS nombre_comercio,
              c.contacto_nombre,
              t.code          AS plan,
              u.id            AS user_id,
              u.email         AS email
         FROM cliente c
         JOIN "user" u ON u.cliente_id = c.id AND lower(u.email) = $1 AND u.deleted_at IS NULL
    LEFT JOIN tier t ON t.id = c.tier_id
        WHERE c.estado = $2
        ORDER BY u.id
        LIMIT 1`,
      [email, ESTADOS.PENDIENTE]
    );

    if (!rows[0]) {
      await client.query('ROLLBACK');
      return { enviado: false };
    }

    const cliente = rows[0];

    // Invalidar los tokens anteriores: si el usuario pide otro link, el que
    // le mandamos antes deja de servir. Sin esto quedan N links vivos por
    // cuenta y cualquiera que haya visto uno viejo puede activarla.
    await client.query(
      'UPDATE email_verification SET used_at = now() WHERE cliente_id = $1 AND used_at IS NULL',
      [cliente.cliente_id]
    );

    const token = nuevoToken();
    await client.query(
      `INSERT INTO email_verification (token, cliente_id, user_id, email, expires_at)
       VALUES ($1,$2,$3,$4, now() + ($5 || ' days')::interval)`,
      [token, cliente.cliente_id, cliente.user_id, cliente.email, String(TTL_DIAS)]
    );

    await encolarMailVerificacion({
      clienteId: cliente.cliente_id,
      email: cliente.email,
      nombreContacto: cliente.contacto_nombre || cliente.nombre_comercio,
      nombreComercio: cliente.nombre_comercio,
      plan: cliente.plan || 'FREE',
      token,
      template: 'verify',
      // Sin idempotencyKey: cada reenvio es un mail nuevo a proposito.
    }, client);

    await client.query('COMMIT');
    return { enviado: true, clienteId: cliente.cliente_id };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Bloquea las cuentas que nunca verificaron. No borra nada: el registro del
 * alta sigue sirviendo para medir conversion del landing.
 */
async function bloquearVencidas() {
  const { rowCount } = await pool.query(
    `UPDATE cliente
        SET estado = $1, updated_at = now()
      WHERE estado = $2
        AND created_at < now() - ($3 || ' days')::interval`,
    [ESTADOS.BLOQUEADO, ESTADOS.PENDIENTE, String(BLOQUEO_DIAS)]
  );
  return { bloqueadas: rowCount };
}

module.exports = {
  verificar,
  reenviar,
  bloquearVencidas,
  encolarMailVerificacion,
  nuevoToken,
  urlVerificacion,
  VerificacionError,
  TTL_DIAS,
  BLOQUEO_DIAS,
};
