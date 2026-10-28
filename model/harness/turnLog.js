// model/harness/turnLog.js — escritura de turn_log (migración 022).
// Va por pool.queryDirecta: la fila no participa de la transacción del turno y
// sobrevive a su ROLLBACK. Un turno que falló es el que más importa loguear.
const pool = require('../../pool');

const COLUMNAS = [
  'cliente_id', 'user_id', 'vertical', 'canal', 'canal_cuenta_id', 'external_user_id',
  'texto', 'intent', 'stage', 'ok', 'gasto', 'model',
  'input_tokens', 'output_tokens', 'cached_tokens', 'cache_write_tokens',
  'msgs_out', 'msgs_billing', 'latency_ms', 'error',
];

const SQL_INSERT = `INSERT INTO turn_log (${COLUMNAS.join(', ')})
  VALUES (${COLUMNAS.map((_, i) => `$${i + 1}`).join(', ')})
  RETURNING id`;

const insertar = async (fila) => {
  const r = await pool.queryDirecta(SQL_INSERT, COLUMNAS.map((c) => (fila[c] === undefined ? null : fila[c])));
  return r.rows[0].id;
};

module.exports = { insertar, COLUMNAS };
