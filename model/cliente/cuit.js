// model/cliente/cuit.js — CUIT del comercio. Es opcional en el alta y obligatorio
// antes del primer pedido (ver middleware/cuitMiddleware.js).
const pool = require('../../pool');

/** CUIT normalizado (11 dígitos) o null si todavía no lo cargó. */
const getCuit = async (clienteId) => {
  const r = await pool.query('SELECT cuit FROM cliente WHERE id = $1', [clienteId]);
  if (!r.rows.length) return null;
  const c = String(r.rows[0].cuit ?? '').replace(/\D/g, '');
  return c || null;
};

/** ¿Lo tiene otro comercio? */
const cuitTomado = async (cuit, clienteId) => {
  const r = await pool.query('SELECT 1 FROM cliente WHERE cuit = $1 AND id <> $2 LIMIT 1', [cuit, clienteId]);
  return r.rows.length > 0;
};

/** Lo guarda solo si el comercio no tenía uno. Devuelve true si lo guardó. */
const setCuitSiVacio = async (clienteId, cuit) => {
  const r = await pool.query(
    `UPDATE cliente SET cuit = $2 WHERE id = $1 AND (cuit IS NULL OR cuit = '') RETURNING id`,
    [clienteId, cuit]
  );
  return r.rowCount > 0;
};

module.exports = { getCuit, cuitTomado, setCuitSiVacio };
