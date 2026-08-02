// middleware/tenantConnection.js
const basePool = require('pg');
const { runWith } = require('../tenantContext');

// Importamos el Pool real, no el proxy, para no recursar
const { Pool } = basePool;
const rawPool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: process.env.NODE_ENV === 'production' },
  max: Number(process.env.PG_POOL_MAX ?? 10),
});

/**
 * Abre una transacción por request con app.cliente_id seteado, y la cierra
 * cuando la respuesta termina. Una transacción por request, no por query.
 */
const withTenantConnection = async (req, res, next) => {
  let client;
  let settled = false;

  const settle = async (commit) => {
    if (settled) return;
    settled = true;
    try {
      await client.query(commit ? 'COMMIT' : 'ROLLBACK');
    } catch (err) {
      console.error('[tenantConnection] cierre:', err.message);
    } finally {
      client.release();
    }
  };

  try {
    client = await rawPool.connect();
    await client.query('BEGIN');
    // set_config con parámetro: seguro contra inyección, a diferencia de SET
    await client.query(`SELECT set_config('app.cliente_id', $1, true)`, [String(req.clienteId)]);
  } catch (err) {
    if (client) client.release();
    return next(err);
  }

  // 4xx/5xx → rollback; 2xx/3xx → commit
  res.on('finish', () => { settle(res.statusCode < 400); });
  res.on('close',  () => { settle(false); });

  runWith({ client, clienteId: req.clienteId }, () => next());
};

module.exports = { withTenantConnection };