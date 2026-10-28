// middleware/tenantConnection.js
const basePool = require('pg');
const { runWith, getStore } = require('../tenantContext');

const { Pool } = basePool;
const rawPool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: process.env.NODE_ENV === 'production' },
  max: Number(process.env.PG_POOL_MAX ?? 10),
});

/**
 * Store de tenant con conexión PEREZOSA: la transacción con app.cliente_id se
 * abre en la PRIMERA query (via pool proxy -> store.getClient()).
 *  - Lo que se rechaza antes de consultar no toca la DB.
 *  - Una sola transacción por unidad de trabajo (getClient cachea el client).
 * `settle(commit)` cierra la tx y libera la conexión; es idempotente.
 *
 * Nota: hoy el RLS NO está aplicado en prod (sólo producto_img, verificado el
 * 27/10/2026). app.cliente_id queda seteado para cuando se aplique; el
 * aislamiento real lo dan los WHERE cliente_id = ... de cada consulta.
 */
const crearStoreTenant = (clienteId) => {
  const store = {
    clienteId,
    client: null,
    cerrado: false,
    _initPromise: null,
    getClient() {
      // Unidad de trabajo cerrada: no abrir otra conexión ni devolver la que volvió al pool.
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

  return { store, settle };
};

/**
 * Middleware HTTP: una transacción de tenant por request.
 * Cierra en finish/close: 2xx/3xx -> COMMIT, 4xx/5xx -> ROLLBACK.
 */
const withTenantConnection = (req, res, next) => {
  const { store, settle } = crearStoreTenant(req.clienteId);

  res.on('finish', () => { settle(res.statusCode < 400); });
  res.on('close',  () => { settle(false); });

  runWith(store, () => next());
};

/**
 * Lo mismo, fuera de un request (crons, harness, tests, agente):
 *   await runWithTenant(clienteId, async () => { ...consultas con pool.query... })
 * COMMIT si `fn` resuelve, ROLLBACK si lanza.
 *
 * Anidado dentro del mismo tenant reutiliza la transacción de afuera. Anidado
 * dentro de OTRO tenant falla: mezclar comercios en una unidad de trabajo es
 * siempre un bug.
 */
const runWithTenant = async (clienteId, fn) => {
  const id = Number(clienteId);
  if (!Number.isInteger(id) || id <= 0) throw new Error(`runWithTenant: cliente_id inválido (${clienteId})`);

  const actual = getStore();
  if (actual && actual.clienteId != null) {
    if (Number(actual.clienteId) !== id) {
      throw new Error(`runWithTenant: ya hay un tenant activo (${actual.clienteId}), no se puede abrir ${id}`);
    }
    return fn();
  }

  const { store, settle } = crearStoreTenant(id);
  let resultado;
  try {
    resultado = await runWith(store, fn);
  } catch (err) {
    await settle(false);
    throw err;
  }
  await settle(true);
  return resultado;
};

module.exports = { withTenantConnection, runWithTenant, crearStoreTenant };
