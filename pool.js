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
 * Proxy: si hay contexto de tenant, las queries van por su client (dentro de la
 * transacción con app.cliente_id). La conexión se abre perezosamente en la
 * primera query (store.getClient()). Sin contexto (cron, scripts, plataforma)
 * van al pool directo.
 */
module.exports = {
  query: async (...args) => {
    const store = getStore();
    if (store && typeof store.getClient === 'function') {
      const client = await store.getClient();
      return client.query(...args);
    }
    return basePool.query(...args);
  },
  connect: (...args) => basePool.connect(...args),
  end: (...args) => basePool.end(...args),
  get totalCount() { return basePool.totalCount; },
  get idleCount() { return basePool.idleCount; },
  get waitingCount() { return basePool.waitingCount; },
};
