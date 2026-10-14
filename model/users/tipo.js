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

const marcarRolesSinTipo = async (cliente_id) => {
  await pool.query(
    `UPDATE rol r
        SET user_type_id = ut.id
       FROM user_type ut
      WHERE r.cliente_id = $1
        AND r.user_type_id IS NULL
        AND lower(trim(r.descripcion)) = lower(ut.descripcion)`,
    [cliente_id]
  );
};

/**
 * Recalcula el tipo del usuario a partir de sus roles. Sin roles no lo toca
 * (por ejemplo, los clientes de pedidos). Devuelve el código resultante o null.
 */
const sincronizarTipo = async (id_user, cliente_id) => {
  // Roles del tenant que todavía no tienen tipo pero se llaman como uno
  // (creados antes de la 012, por una API vieja o a mano como "profesor"):
  // se marcan acá. Sin esto un profesor quedaba como empleado (bug CP-07).
  await marcarRolesSinTipo(cliente_id);
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

// ─── Usuarios externos (profesor, tutor, alumno) ─────────────────────────────
// Se gestionan desde Academia (crm_api /api/edu), nunca desde Usuarios/Roles:
// ahí no se les asigna ni se les quita rol, ni se editan o borran.
const TIPOS_EXTERNOS = ['PROF', 'TUT', 'ALU'];

// Código de tipo de un rol: el de su user_type_id o, si no tiene (rol viejo o
// creado a mano), el del tipo con el mismo nombre. Igual criterio que
// marcarRolesSinTipo, pero sin escribir.
const CODIGO_ROL = (r) => `COALESCE(
  (SELECT codigo FROM user_type WHERE id = ${r}.user_type_id),
  (SELECT codigo FROM user_type WHERE ${r}.user_type_id IS NULL AND lower(descripcion) = lower(trim(${r}.descripcion)) ORDER BY id LIMIT 1)
)`;

const rolEsExterno = async (id_rol, cliente_id) => {
  const { rows } = await pool.query(
    `SELECT ${CODIGO_ROL('r')} AS codigo FROM rol r WHERE r.id = $1 AND r.cliente_id = $2`,
    [id_rol, cliente_id]
  );
  return TIPOS_EXTERNOS.includes(rows[0]?.codigo);
};

/** El usuario es de la academia: su tipo es externo o tiene algún rol externo. */
const userEsExterno = async (id_user, cliente_id) => {
  const { rows } = await pool.query(
    `SELECT (ut.codigo = ANY($3::text[])) OR EXISTS (
              SELECT 1 FROM user_rol ur JOIN rol r ON r.id = ur.id_rol AND r.cliente_id = ur.cliente_id
               WHERE ur.id_user = u.id AND ur.cliente_id = u.cliente_id
                 AND ${CODIGO_ROL('r')} = ANY($3::text[])
            ) AS externo
       FROM "user" u LEFT JOIN user_type ut ON ut.id = u.user_type_id
      WHERE u.id = $1 AND u.cliente_id = $2`,
    [id_user, cliente_id, TIPOS_EXTERNOS]
  );
  return rows[0]?.externo === true;
};

/** ¿El nombre coincide con un tipo externo? (crear un rol "Profesor" a mano lo volvería externo). */
const nombreDeTipoExterno = async (descripcion) => {
  const { rows } = await pool.query(
    `SELECT 1 FROM user_type WHERE lower(descripcion) = lower(trim($1)) AND codigo = ANY($2::text[]) LIMIT 1`,
    [String(descripcion ?? ''), TIPOS_EXTERNOS]
  );
  return rows.length > 0;
};

module.exports = {
  sincronizarTipo, marcarRolesSinTipo, getUserTypeIdPorCodigo, ORDEN_TIPO,
  TIPOS_EXTERNOS, CODIGO_ROL, rolEsExterno, userEsExterno, nombreDeTipoExterno,
};
