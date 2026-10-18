// middleware/tenantConnection.js
const basePool = require('pg');
const { runWith } = require('../tenantContext');

const { Pool } = basePool;
const rawPool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: process.env.NODE_ENV === 'production' },
  max: Number(process.env.PG_POOL_MAX ?? 10),
});

/**
 * Conexión de tenant PEREZOSA: la transacción con app.cliente_id se abre en la
 * PRIMERA query (via pool proxy -> store.getClient()), no al inicio del request.
 * Beneficios:
 *  - Requests rechazados antes de consultar (403 tenant, 400 param, 404) no
 *    tocan la DB.
 *  - Una sola transacción por request igual (getClient cachea el client).
 * Cierra la tx en finish/close: 2xx/3xx -> COMMIT, 4xx/5xx -> ROLLBACK.
 */
const withTenantConnection = (req, res, next) => {
  const store = {
    clienteId: req.clienteId,
    client: null,
    cerrado: false,
    _initPromise: null,
    getClient() {
      // Request ya cerrado: no abrir otra conexión ni devolver la que volvió al pool.
      if (this.cerrado) return Promise.reject(new Error('Request cerrado: sin conexión de tenant'));
      if (this.client) return Promise.resolve(this.client);
      if (!this._initPromise) {
        this._initPromise = (async () => {
          const c = await rawPool.connect();
          try {
            await c.query('BEGIN');
            // set_config con parámetro: seguro contra inyección
            await c.query(`SELECT set_config('app.cliente_id', $1, true)`, [String(this.clienteId)]);
          } catch (err) {
            c.release();
            throw err;
          }
          this.client = c;
          return c;
        })();
      }
      return this._initPromise;
    },
  };

  const settle = async (commit) => {
    if (store.cerrado) return;
    store.cerrado = true;
    if (!store._initPromise) return; // nunca se conectó: nada que cerrar
    // Si el cierre llega mientras la conexión se está abriendo (cliente que
    // abortó con el pool ocupado), esperarla para liberarla: si no, queda
    // tomada para siempre con la transacción abierta.
    let client;
    try {
      client = await store._initPromise;
    } catch {
      return; // la apertura falló y ya liberó
    }
    store.client = null;
    try {
      await client.query(commit ? 'COMMIT' : 'ROLLBACK');
    } catch (err) {
      console.error('[tenantConnection] cierre:', err.message);
    } finally {
      client.release();
    }
  };

  res.on('finish', () => { settle(res.statusCode < 400); });
  res.on('close',  () => { settle(false); });

  runWith(store, () => next());
};

module.exports = { withTenantConnection };
