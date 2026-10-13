// model/edu/personas.js — profesores, tutores y alumnos. Siempre por cliente_id.
const pool = require('../../pool');

// Nombre de tabla fijo por entidad (nunca viene del request).
const TABLAS = { profesor: 'edu_profesor', tutor: 'edu_tutor', alumno: 'edu_alumno' };
const tabla = (entidad) => {
  const t = TABLAS[entidad];
  if (!t) throw new Error(`Entidad edu desconocida: ${entidad}`);
  return t;
};

const ACTIVA = `(i.fecha_baja IS NULL OR i.fecha_baja >= $2::date)`;

const SELECT = {
  profesor: `
    SELECT p.id, p.user_id, p.nombre, p.apellido, p.telefono, p.email, p.activo,
           (SELECT count(*)::int FROM edu_inscripcion i
             WHERE i.cliente_id = p.cliente_id AND i.profesor_id = p.id AND ${ACTIVA}) AS inscripciones_activas
      FROM edu_profesor p`,
  tutor: `
    SELECT p.id, p.user_id, p.nombre, p.apellido, p.telefono, p.email, p.activo,
           (SELECT count(*)::int FROM edu_alumno a
             WHERE a.cliente_id = p.cliente_id AND a.tutor_id = p.id AND a.activo
               AND $2::date IS NOT NULL) AS alumnos_activos  -- $2 (hoy) para que todas las consultas compartan parámetros
      FROM edu_tutor p`,
  alumno: `
    SELECT p.id, p.user_id, p.tutor_id, p.nombre, p.apellido, p.telefono, p.email,
           to_char(p.fecha_nacimiento, 'YYYY-MM-DD') AS fecha_nacimiento, p.activo,
           t.nombre || ' ' || t.apellido AS tutor,
           (SELECT count(*)::int FROM edu_inscripcion i
             WHERE i.cliente_id = p.cliente_id AND i.alumno_id = p.id AND ${ACTIVA}) AS inscripciones_activas
      FROM edu_alumno p
      LEFT JOIN edu_tutor t ON t.id = p.tutor_id AND t.cliente_id = p.cliente_id`,
};

/** Lista con búsqueda por nombre, apellido, email o teléfono. */
const listar = async (entidad, cliente_id, { hoy, q, activo, tutor_id }) => {
  tabla(entidad);
  const { rows } = await pool.query(
    `${SELECT[entidad]}
      WHERE p.cliente_id = $1
        AND ($3::text IS NULL OR (p.nombre || ' ' || p.apellido || ' ' || coalesce(p.email, '') || ' ' || coalesce(p.telefono, '')) ILIKE '%' || $3 || '%')
        AND ($4::boolean IS NULL OR p.activo = $4)
        ${entidad === 'alumno' ? 'AND ($5::int IS NULL OR p.tutor_id = $5)' : 'AND $5::int IS NULL'}
      ORDER BY p.apellido, p.nombre`,
    [cliente_id, hoy, q || null, activo ?? null, tutor_id ?? null]
  );
  return rows;
};

const get = async (entidad, cliente_id, id, hoy) => {
  tabla(entidad);
  const { rows } = await pool.query(`${SELECT[entidad]} WHERE p.cliente_id = $1 AND p.id = $3`, [cliente_id, hoy, id]);
  return rows[0] || null;
};

const porUserId = async (entidad, cliente_id, user_id) => {
  const { rows } = await pool.query(
    `SELECT id, activo FROM ${tabla(entidad)} WHERE cliente_id = $1 AND user_id = $2`,
    [cliente_id, user_id]
  );
  return rows[0] || null;
};

const crear = async (entidad, cliente_id, d) => {
  if (entidad === 'alumno') {
    return (await pool.query(
      `INSERT INTO edu_alumno (cliente_id, nombre, apellido, telefono, email, fecha_nacimiento, tutor_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [cliente_id, d.nombre, d.apellido, d.telefono, d.email, d.fecha_nacimiento, d.tutor_id]
    )).rows[0];
  }
  return (await pool.query(
    `INSERT INTO ${tabla(entidad)} (cliente_id, nombre, apellido, telefono, email)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [cliente_id, d.nombre, d.apellido, d.telefono, d.email]
  )).rows[0];
};

const actualizar = async (entidad, cliente_id, id, d) => {
  if (entidad === 'alumno') {
    return (await pool.query(
      `UPDATE edu_alumno
          SET nombre = $3, apellido = $4, telefono = $5, email = $6, fecha_nacimiento = $7, tutor_id = $8,
              activo = $9, updated_at = CURRENT_TIMESTAMP
        WHERE cliente_id = $1 AND id = $2 RETURNING id`,
      [cliente_id, id, d.nombre, d.apellido, d.telefono, d.email, d.fecha_nacimiento, d.tutor_id, d.activo]
    )).rows[0] || null;
  }
  return (await pool.query(
    `UPDATE ${tabla(entidad)}
        SET nombre = $3, apellido = $4, telefono = $5, email = $6, activo = $7, updated_at = CURRENT_TIMESTAMP
      WHERE cliente_id = $1 AND id = $2 RETURNING id`,
    [cliente_id, id, d.nombre, d.apellido, d.telefono, d.email, d.activo]
  )).rows[0] || null;
};

const setUserId = async (entidad, cliente_id, id, user_id) => (await pool.query(
  `UPDATE ${tabla(entidad)} SET user_id = $3, updated_at = CURRENT_TIMESTAMP
    WHERE cliente_id = $1 AND id = $2 AND user_id IS NULL RETURNING id`,
  [cliente_id, id, user_id]
)).rows[0] || null;

const setActivo = async (entidad, cliente_id, id, activo) => (await pool.query(
  `UPDATE ${tabla(entidad)} SET activo = $3, updated_at = CURRENT_TIMESTAMP
    WHERE cliente_id = $1 AND id = $2 RETURNING id`,
  [cliente_id, id, activo]
)).rows[0] || null;

/** Alumnos activos de un tutor (para bloquear su baja). */
const alumnosActivosDeTutor = async (cliente_id, tutor_id) => (await pool.query(
  `SELECT count(*)::int AS n FROM edu_alumno WHERE cliente_id = $1 AND tutor_id = $2 AND activo`,
  [cliente_id, tutor_id]
)).rows[0].n;

module.exports = {
  TABLAS,
  listar,
  get,
  porUserId,
  crear,
  actualizar,
  setUserId,
  setActivo,
  alumnosActivosDeTutor,
};
