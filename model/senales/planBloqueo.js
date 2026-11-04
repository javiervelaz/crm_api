// model/senales/planBloqueo.js — registro de choques contra el plan (migración 029).
//
// Va por pool.queryDirecta: fuera de la transacción del request (un 403 no
// debería depender de que el request haga COMMIT). Agregado por hora con
// contador, así un front que reintenta en loop no infla la tabla.
const pool = require('../../pool');

const TIPOS = new Set(['feature', 'limite', 'vencido']);

/** Ruta sin querystring ni ids (no guarda datos del request): /api/reportes/ventas/:id */
const rutaSegura = (req) => (String(req?.baseUrl || '') + String(req?.route?.path || req?.path || ''))
  .split('?')[0]
  .replace(/\/\d+(?=\/|$)/g, '/:id')
  .replace(/\/[0-9a-f-]{20,}(?=\/|$)/gi, '/:id');

const registrar = async ({ clienteId, tipo, clave, tierCode = null, ruta = null, userId = null }) => {
  if (!Number.isInteger(Number(clienteId)) || !TIPOS.has(tipo) || !clave) return;
  await pool.queryDirecta(
    `INSERT INTO plan_bloqueo (cliente_id, hora, tipo, clave, tier_code, ultima_ruta, ultimo_user_id)
     VALUES ($1, date_trunc('hour', now()), $2, $3, $4, $5, $6)
     ON CONFLICT (cliente_id, hora, tipo, clave) DO UPDATE
        SET veces = plan_bloqueo.veces + 1,
            tier_code = EXCLUDED.tier_code,
            ultima_ruta = EXCLUDED.ultima_ruta,
            ultimo_user_id = EXCLUDED.ultimo_user_id,
            ultima_vez = now()`,
    [Number(clienteId), tipo, String(clave).slice(0, 60), tierCode, ruta ? String(ruta).slice(0, 120) : null, userId ?? null],
  );
};

/** Nunca lanza: la señal no puede cambiar la respuesta del request. */
const registrarSeguro = async (datos) => {
  try {
    await module.exports.registrar(datos); // por module.exports: se puede stubear en tests
  } catch (err) {
    console.error('[plan_bloqueo]', err.message);
  }
};

module.exports = { registrar, registrarSeguro, rutaSegura };
