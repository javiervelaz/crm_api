// pool.js
const { Pool } = require('pg');
const { getStore } = require('./tenantContext');

const basePool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: process.env.NODE_ENV === 'production' },
  max: Number(process.env.PG_POOL_MAX ?? 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

basePool.on('error', (err) => console.error('[pg pool]', err));

/**
 * Proxy: si hay un client de tenant en el contexto async, las queries van por
 * ahí (dentro de la transacción con app.cliente_id seteado). Si no, van al pool
 * directo — para cron, scripts y rutas de plataforma.
 */
module.exports = {
  query: (...args) => {
    const store = getStore();
    return store?.client ? store.client.query(...args) : basePool.query(...args);
  },
  connect: (...args) => basePool.connect(...args),
  end: (...args) => basePool.end(...args),
  get totalCount() { return basePool.totalCount; },
  get idleCount() { return basePool.idleCount; },
  get waitingCount() { return basePool.waitingCount; },
};