// services/email/outboxWorker.js
// Drena la cola: toma pendientes, renderiza, manda, marca resultado.

const pool = require('../../pool');
const outbox = require('./outbox');
const { render } = require('./renderer');
const { getProvider } = require('./providers');
const { ProviderError } = require('./errors');

const DEFAULT_BATCH = Number(process.env.EMAIL_DRAIN_BATCH || 20);

/**
 * Procesa hasta `limit` mails pendientes.
 *
 * Usa pool.connect() y no el proxy de pool.query: el proxy rutea a la
 * transaccion del tenant si hay una en el contexto async, y el worker tiene
 * que ver la cola entera, no la de un cliente.
 *
 * @returns {Promise<{sent:number, failed:number, retry:number, procesados:number}>}
 */
async function drain({ limit = DEFAULT_BATCH } = {}) {
  const resultado = { sent: 0, failed: 0, retry: 0, procesados: 0 };
  const client = await pool.connect();

  let filas;
  try {
    filas = await outbox.claim(client, limit);
  } catch (err) {
    client.release();
    throw err;
  }

  if (!filas.length) {
    client.release();
    return resultado;
  }

  const provider = getProvider();

  try {
    for (const row of filas) {
      resultado.procesados += 1;
      try {
        const { subject, html, text } = render(row.template, row.payload || {});

        const { providerMessageId } = await provider.send({
          toEmail: row.to_email,
          toName: row.to_name,
          fromEmail: row.from_email,
          fromName: row.from_name,
          replyTo: row.reply_to,
          idempotencyKey: row.idempotency_key,
          subject, html, text,
        });

        await outbox.markSent(client, row.id, {
          provider: provider.name, providerMessageId,
        });
        resultado.sent += 1;
      } catch (err) {
        // Un template roto o un payload invalido no se arregla reintentando
        const clasificado = err instanceof ProviderError
          ? err
          : new ProviderError(`render/interno: ${err.message}`, { permanent: true });

        const { estado } = await outbox.markFailed(client, row, clasificado);
        if (estado === 'failed') {
          resultado.failed += 1;
          console.error(
            `[email/worker] mail ${row.id} (${row.template} → ${row.to_email}) FALLÓ definitivo:`,
            clasificado.message
          );
        } else {
          resultado.retry += 1;
          console.warn(
            `[email/worker] mail ${row.id} reintenta (intento ${row.attempts}/${row.max_attempts}):`,
            clasificado.message
          );
        }
      }
    }
  } finally {
    client.release();
  }

  return resultado;
}

/**
 * Loop para correr como proceso persistente (VPS). En Vercel no se usa: alla
 * el drenado lo dispara el cron y el waitUntil post-request.
 */
function startLoop({ intervalMs = 15_000, limit = DEFAULT_BATCH } = {}) {
  let corriendo = false;
  let detenido = false;

  const tick = async () => {
    if (corriendo || detenido) return;
    corriendo = true;
    try {
      const r = await drain({ limit });
      if (r.procesados) {
        console.log(`[email/worker] ${r.sent} enviados, ${r.retry} a reintento, ${r.failed} fallidos`);
      }
    } catch (err) {
      console.error('[email/worker] drain:', err.message);
    } finally {
      corriendo = false;
    }
  };

  const timer = setInterval(tick, intervalMs);
  timer.unref?.();
  tick();

  return () => { detenido = true; clearInterval(timer); };
}

module.exports = { drain, startLoop };
