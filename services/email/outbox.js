// services/email/outbox.js
// Acceso a la tabla email_outbox. SQL puro, sin logica de envio.

const pool = require('../../pool');

const MAX_ATTEMPTS = Number(process.env.EMAIL_MAX_ATTEMPTS || 5);

/**
 * Encola un mail.
 *
 * Si se pasa `tx` (un client de pg dentro de una transaccion), el INSERT entra
 * en esa transaccion: si el COMMIT falla, no queda un mail encolado para una
 * cuenta que no existe; si sale, el mail esta garantizado aunque el proveedor
 * este caido en ese instante.
 *
 * @param {object} params
 * @param {import('pg').PoolClient} [tx]
 * @returns {Promise<{id: string|null, duplicado: boolean}>}
 */
async function enqueue(params, tx) {
  const {
    template, to, toName = null, clienteId = null,
    fromEmail, fromName, replyTo = null,
    data = {}, idempotencyKey = null,
    scheduledAt = null, maxAttempts = MAX_ATTEMPTS,
  } = params;

  if (!template) throw new Error('enqueue: falta "template"');
  if (!to) throw new Error('enqueue: falta "to"');
  if (!fromEmail || !fromName) throw new Error('enqueue: falta remitente resuelto');

  const q = tx || pool;

  // ON CONFLICT DO NOTHING sobre idempotency_key: un retry del signup que pase
  // el rate limit no manda dos bienvenidas.
  const { rows } = await q.query(
    `INSERT INTO email_outbox (
       cliente_id, template, to_email, to_name,
       from_email, from_name, reply_to,
       payload, idempotency_key, max_attempts, scheduled_at
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10, COALESCE($11::timestamptz, now()))
     ON CONFLICT (idempotency_key) DO NOTHING
     RETURNING id`,
    [
      clienteId, template, String(to).trim().toLowerCase(), toName,
      fromEmail, fromName, replyTo,
      JSON.stringify(data), idempotencyKey, maxAttempts, scheduledAt,
    ]
  );

  return rows[0]
    ? { id: rows[0].id, duplicado: false }
    : { id: null, duplicado: true };
}

/**
 * Toma hasta `limit` mails para enviar y los marca 'sending'.
 *
 * SKIP LOCKED permite varias invocaciones concurrentes de la lambda sin que
 * dos manden el mismo mail. El rescate de locks huerfanos (locked_at viejo)
 * cubre la lambda que muere entre el claim y el envio: riesgo real en
 * serverless, donde el runtime puede congelarte en cualquier momento.
 */
async function claim(client, limit = 20) {
  const staleMinutes = Number(process.env.EMAIL_LOCK_STALE_MIN || 5);

  const { rows } = await client.query(
    `UPDATE email_outbox
        SET status = 'sending', locked_at = now(), attempts = attempts + 1, updated_at = now()
      WHERE id IN (
        SELECT id FROM email_outbox
         WHERE (status = 'pending' AND scheduled_at <= now())
            OR (status = 'sending' AND locked_at < now() - ($2 || ' minutes')::interval)
         ORDER BY scheduled_at
         FOR UPDATE SKIP LOCKED
         LIMIT $1
      )
      RETURNING *`,
    [limit, String(staleMinutes)]
  );

  return rows;
}

async function markSent(client, id, { provider, providerMessageId }) {
  await client.query(
    `UPDATE email_outbox
        SET status = 'sent', sent_at = now(), updated_at = now(),
            provider = $2, provider_message_id = $3, last_error = NULL, locked_at = NULL
      WHERE id = $1`,
    [id, provider, providerMessageId]
  );
}

/**
 * Marca el fallo. Si el error es permanente o se agotaron los intentos, la
 * fila muere en 'failed'. Si no, vuelve a 'pending' con backoff exponencial:
 * 1, 2, 4, 8, 16 minutos.
 */
async function markFailed(client, row, err) {
  const agotado = row.attempts >= row.max_attempts;
  const definitivo = Boolean(err.permanent) || agotado;

  if (definitivo) {
    await client.query(
      `UPDATE email_outbox
          SET status = 'failed', updated_at = now(), locked_at = NULL, last_error = $2
        WHERE id = $1`,
      [row.id, String(err.message).slice(0, 1000)]
    );
    return { estado: 'failed' };
  }

  const backoffMin = Math.pow(2, Math.max(0, row.attempts - 1));
  await client.query(
    `UPDATE email_outbox
        SET status = 'pending', locked_at = NULL, updated_at = now(),
            last_error = $2,
            scheduled_at = now() + ($3 || ' minutes')::interval
      WHERE id = $1`,
    [row.id, String(err.message).slice(0, 1000), String(backoffMin)]
  );
  return { estado: 'pending', reintentaEnMin: backoffMin };
}

/** Diagnostico: cuantos mails hay en cada estado. */
async function stats() {
  const { rows } = await pool.query(
    `SELECT status, count(*)::int AS total FROM email_outbox GROUP BY status`
  );
  return rows.reduce((acc, r) => ({ ...acc, [r.status]: r.total }), {});
}

module.exports = { enqueue, claim, markSent, markFailed, stats, MAX_ATTEMPTS };
