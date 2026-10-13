// model/profile/legajo.js
//
// Legajo autonumérico por tenant (migrations/014_legajo_autonumerico.sql).
const pool = require('../../pool');

// Mayor legajo numérico ya cargado en el tenant (los "ADMIN-25" no cuentan).
const MAX_NUMERICO = `
  SELECT COALESCE(MAX(CASE WHEN trim(legajo) ~ '^[0-9]{1,9}$' THEN trim(legajo)::int END), 0)
    FROM profile WHERE cliente_id = $1`;

/**
 * Reserva el siguiente legajo del tenant. Atómico: el UPSERT bloquea la fila
 * del tenant, así dos altas simultáneas no reciben el mismo número.
 * Acepta un `db` opcional (client de una transacción, ej. el alta de tenant).
 */
const siguienteLegajo = async (cliente_id, db = pool) => {
  const { rows } = await db.query(
    `INSERT INTO legajo_secuencia (cliente_id, ultimo)
     VALUES ($1, (${MAX_NUMERICO}) + 1)
     ON CONFLICT (cliente_id)
       DO UPDATE SET ultimo = legajo_secuencia.ultimo + 1, updated_at = CURRENT_TIMESTAMP
     RETURNING ultimo`,
    [cliente_id]
  );
  return String(rows[0].ultimo);
};

/** El legajo que tendría la próxima alta, sin reservarlo (para mostrarlo en el formulario). */
const proximoLegajo = async (cliente_id) => {
  const { rows } = await pool.query(
    `SELECT COALESCE(
              (SELECT ultimo FROM legajo_secuencia WHERE cliente_id = $1),
              (${MAX_NUMERICO})
            ) + 1 AS proximo`,
    [cliente_id]
  );
  return String(rows[0].proximo);
};

module.exports = { siguienteLegajo, proximoLegajo };
