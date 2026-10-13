// model/users/tipo.js
//
// El tipo de usuario (user.user_type_id) se deriva de los roles: ver
// migrations/012_rol_user_type.sql. Se recalcula cada vez que cambian los
// roles de un usuario. Viaja en el JWT como `tipo` y decide si el usuario es
// staff o externo (middleware/cuentaGuards.js), así que no lo elige nadie a mano.
const pool = require('../../pool');

// Prioridad: gana el tipo con más acceso. Un rol sin tipo (creado a mano por
// el admin) cuenta como empleado.
const ORDEN_TIPO = `
  CASE ut.codigo
    WHEN 'ADMIN' THEN 1 WHEN 'EMP' THEN 2 WHEN 'PROV' THEN 3 WHEN 'CLI' THEN 4
    WHEN 'PROF' THEN 5 WHEN 'TUT' THEN 6 WHEN 'ALU' THEN 7 ELSE 2
  END`;

const EMP_ID = `(SELECT id FROM user_type WHERE codigo = 'EMP' ORDER BY id LIMIT 1)`;

/**
 * Recalcula el tipo del usuario a partir de sus roles. Sin roles no lo toca
 * (por ejemplo, los clientes de pedidos). Devuelve el código resultante o null.
 */
const sincronizarTipo = async (id_user, cliente_id) => {
  const { rows } = await pool.query(
    `WITH derivado AS (
       SELECT ut.id, ut.codigo
         FROM user_rol ur
         JOIN rol r        ON r.id = ur.id_rol AND r.cliente_id = ur.cliente_id
         JOIN user_type ut ON ut.id = COALESCE(r.user_type_id, ${EMP_ID})
        WHERE ur.id_user = $1 AND ur.cliente_id = $2
        ORDER BY ${ORDEN_TIPO}, ut.id
        LIMIT 1
     ), upd AS (
       UPDATE "user" u
          SET user_type_id = d.id, updated_at = CURRENT_TIMESTAMP
         FROM derivado d
        WHERE u.id = $1 AND u.cliente_id = $2
          AND u.user_type_id IS DISTINCT FROM d.id
     )
     SELECT codigo FROM derivado`,
    [id_user, cliente_id]
  );
  return rows[0]?.codigo ?? null;
};

/** Id del user_type con ese código (ej. 'EMP'), o null. */
const getUserTypeIdPorCodigo = async (codigo) => {
  const { rows } = await pool.query(
    `SELECT id FROM user_type WHERE codigo = $1 ORDER BY id LIMIT 1`,
    [codigo]
  );
  return rows[0]?.id ?? null;
};

module.exports = { sincronizarTipo, getUserTypeIdPorCodigo, ORDEN_TIPO };
