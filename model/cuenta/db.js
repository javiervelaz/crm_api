// model/cuenta/db.js
// Credenciales y contraseñas. Todas las queries corren dentro de la
// transacción del request (middleware/tenantConnection.js): si el request
// termina en 4xx/5xx se hace ROLLBACK de todo.
const pool = require('../../pool');

/** Tipo de usuario habilitado para el rubro del tenant, por código. */
const getUserTypeDelRubro = async (cliente_id, codigo) => {
  const { rows } = await pool.query(
    `SELECT ut.id, ut.codigo, ut.descripcion
       FROM user_type ut
       JOIN rubro_user_type rut ON rut.user_type_id = ut.id
       JOIN cliente c           ON c.rubro_codigo = rut.rubro_codigo
      WHERE c.id = $1 AND ut.codigo = $2`,
    [cliente_id, codigo]
  );
  return rows[0] || null;
};

/** Tipos que el admin puede dar de alta con credenciales (todos menos ADMIN). */
const getTiposCredenciales = async (cliente_id) => {
  const { rows } = await pool.query(
    `SELECT ut.id, ut.codigo, ut.descripcion
       FROM user_type ut
       JOIN rubro_user_type rut ON rut.user_type_id = ut.id
       JOIN cliente c           ON c.rubro_codigo = rut.rubro_codigo
      WHERE c.id = $1 AND ut.codigo <> 'ADMIN'
      ORDER BY ut.id`,
    [cliente_id]
  );
  return rows;
};

const emailExiste = async (email) => {
  const { rows } = await pool.query(
    `SELECT 1 FROM "user" WHERE lower(email) = lower($1) AND deleted_at IS NULL`,
    [email]
  );
  return rows.length > 0;
};

const crearUser = async ({ nombre, apellido, email, user_type_id, cliente_id }) => {
  const { rows } = await pool.query(
    `INSERT INTO "user" (nombre, apellido, email, user_type_id, cliente_id)
     VALUES ($1,$2,$3,$4,$5)
     RETURNING id, nombre, apellido, email, user_type_id, cliente_id`,
    [nombre, apellido, email, user_type_id, cliente_id]
  );
  return rows[0];
};

const crearProfile = async ({ id_user, dni, telefono, passwordHash, legajo, cliente_id }) => {
  await pool.query(
    `INSERT INTO profile (id_user, dni, telefono, password, legajo, fecha_ingreso, cliente_id, debe_cambiar_password)
     VALUES ($1, $2, $3, $4, $5, (now() AT TIME ZONE 'America/Argentina/Cordoba')::date, $6, true)`,
    [id_user, dni || 0, telefono || null, passwordHash, legajo, cliente_id]
  );
};

/** Rol del tenant para un tipo de usuario; lo crea si el admin lo borró. */
// Rol del tenant para ese tipo de usuario. Se busca por rol.user_type_id (el
// admin puede renombrar el rol); si no hay, por descripción (roles anteriores a
// la migración 012) y se lo marca; si tampoco, se crea.
const getOrCreateRol = async (cliente_id, userType) => {
  const porTipo = await pool.query(
    `SELECT id FROM rol WHERE cliente_id = $1 AND user_type_id = $2 ORDER BY id LIMIT 1`,
    [cliente_id, userType.id]
  );
  if (porTipo.rows[0]) return porTipo.rows[0].id;

  const porNombre = await pool.query(
    `UPDATE rol SET user_type_id = $3
      WHERE id = (SELECT id FROM rol
                   WHERE cliente_id = $1 AND user_type_id IS NULL AND lower(descripcion) = lower($2)
                   ORDER BY id LIMIT 1)
      RETURNING id`,
    [cliente_id, userType.descripcion, userType.id]
  );
  if (porNombre.rows[0]) return porNombre.rows[0].id;

  const ins = await pool.query(
    `INSERT INTO rol (descripcion, cliente_id, user_type_id) VALUES ($1, $2, $3) RETURNING id`,
    [userType.descripcion, cliente_id, userType.id]
  );
  return ins.rows[0].id;
};

const asignarRol = async (id_user, id_rol, cliente_id) => {
  await pool.query(
    `INSERT INTO user_rol (id_rol, id_user, cliente_id) VALUES ($1, $2, $3)`,
    [id_rol, id_user, cliente_id]
  );
};

/** Usuario del tenant con su password hash y tipo (para cambio/reset). */
const getUsuarioConPassword = async (id_user, cliente_id) => {
  const { rows } = await pool.query(
    `SELECT u.id, u.email, u.nombre, u.apellido, ut.codigo AS tipo, p.password
       FROM "user" u
       JOIN profile p ON p.id_user = u.id
       LEFT JOIN user_type ut ON ut.id = u.user_type_id
      WHERE u.id = $1 AND u.cliente_id = $2 AND u.deleted_at IS NULL`,
    [id_user, cliente_id]
  );
  return rows[0] || null;
};

const setPassword = async (id_user, cliente_id, passwordHash, debeCambiar) => {
  const { rowCount } = await pool.query(
    `UPDATE profile
        SET password = $3, debe_cambiar_password = $4, updated_at = CURRENT_TIMESTAMP
      WHERE id_user = $1 AND cliente_id = $2`,
    [id_user, cliente_id, passwordHash, debeCambiar]
  );
  return rowCount > 0;
};

module.exports = {
  getUserTypeDelRubro,
  getTiposCredenciales,
  emailExiste,
  crearUser,
  crearProfile,
  getOrCreateRol,
  asignarRol,
  getUsuarioConPassword,
  setPassword,
};
