// model/edu/inscripciones.js — inscripciones y horarios. Siempre por cliente_id.
const pool = require('../../pool');

const D = (col) => `to_char(${col}, 'YYYY-MM-DD')`;
const H = (col) => `to_char(${col}, 'HH24:MI')`;

// "Activa" a una fecha: sin baja o con baja posterior o igual.
const ACTIVA = (alias, param) => `(${alias}.fecha_baja IS NULL OR ${alias}.fecha_baja >= ${param}::date)`;

const SELECT = `
  SELECT i.id, i.alumno_id, i.clase_id, i.profesor_id, i.ciclo,
         ${D('i.fecha_alta')} AS fecha_alta, ${D('i.fecha_baja')} AS fecha_baja,
         a.nombre || ' ' || a.apellido AS alumno, a.tutor_id,
         c.nombre AS clase, t.nombre AS tipo_clase, t.es_grupal,
         p.nombre || ' ' || p.apellido AS profesor,
         COALESCE((
           SELECT json_agg(json_build_object(
                    'id', h.id, 'dia_semana', h.dia_semana,
                    'hora_inicio', ${H('h.hora_inicio')}, 'hora_fin', ${H('h.hora_fin')})
                  ORDER BY h.dia_semana, h.hora_inicio)
             FROM edu_inscripcion_horario h WHERE h.inscripcion_id = i.id
         ), '[]'::json) AS horarios
    FROM edu_inscripcion i
    JOIN edu_alumno a      ON a.id = i.alumno_id   AND a.cliente_id = i.cliente_id
    JOIN edu_clase c       ON c.id = i.clase_id    AND c.cliente_id = i.cliente_id
    JOIN edu_tipo_clase t  ON t.id = c.tipo_clase_id
    JOIN edu_profesor p    ON p.id = i.profesor_id AND p.cliente_id = i.cliente_id`;

/**
 * Lista con filtros. `alcance` restringe por persona (vista propia de
 * profesor, tutor o alumno): { profesor_id } | { tutor_id } | { alumno_id }.
 */
const listar = async (cliente_id, f = {}, alcance = {}) => {
  const { rows } = await pool.query(
    `${SELECT}
      WHERE i.cliente_id = $1
        AND ($2::int IS NULL OR i.ciclo = $2)
        AND ($3::int IS NULL OR i.profesor_id = $3)
        AND ($4::int IS NULL OR i.alumno_id = $4)
        AND ($5::int IS NULL OR i.clase_id = $5)
        AND ($6::date IS NULL OR ${ACTIVA('i', '$6')})
        AND ($7::int IS NULL OR i.profesor_id = $7)
        AND ($8::int IS NULL OR a.tutor_id = $8)
        AND ($9::int IS NULL OR i.alumno_id = $9)
      ORDER BY a.apellido, a.nombre, c.nombre`,
    [
      cliente_id, f.ciclo ?? null, f.profesor_id ?? null, f.alumno_id ?? null, f.clase_id ?? null,
      f.activasAl ?? null, alcance.profesor_id ?? null, alcance.tutor_id ?? null, alcance.alumno_id ?? null,
    ]
  );
  return rows;
};

const get = async (cliente_id, id, alcance = {}) => {
  const { rows } = await pool.query(
    `${SELECT}
      WHERE i.cliente_id = $1 AND i.id = $2
        AND ($3::int IS NULL OR i.profesor_id = $3)
        AND ($4::int IS NULL OR a.tutor_id = $4)
        AND ($5::int IS NULL OR i.alumno_id = $5)`,
    [cliente_id, id, alcance.profesor_id ?? null, alcance.tutor_id ?? null, alcance.alumno_id ?? null]
  );
  return rows[0] || null;
};

const existeDuplicada = async (cliente_id, { alumno_id, clase_id, ciclo }, excluirId = null) => (await pool.query(
  `SELECT id FROM edu_inscripcion
    WHERE cliente_id = $1 AND alumno_id = $2 AND clase_id = $3 AND ciclo = $4 AND ($5::int IS NULL OR id <> $5)`,
  [cliente_id, alumno_id, clase_id, ciclo, excluirId]
)).rows[0] || null;

const crear = async (cliente_id, d) => (await pool.query(
  `INSERT INTO edu_inscripcion (cliente_id, alumno_id, clase_id, profesor_id, ciclo, fecha_alta)
   VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
  [cliente_id, d.alumno_id, d.clase_id, d.profesor_id, d.ciclo, d.fecha_alta]
)).rows[0];

const actualizar = async (cliente_id, id, d) => (await pool.query(
  `UPDATE edu_inscripcion
      SET profesor_id = $3, fecha_alta = $4, fecha_baja = $5, updated_at = CURRENT_TIMESTAMP
    WHERE cliente_id = $1 AND id = $2 RETURNING id`,
  [cliente_id, id, d.profesor_id, d.fecha_alta, d.fecha_baja]
)).rows[0] || null;

/** Reemplaza todos los horarios de la inscripción. */
const reemplazarHorarios = async (cliente_id, inscripcion_id, horarios) => {
  await pool.query(
    `DELETE FROM edu_inscripcion_horario WHERE cliente_id = $1 AND inscripcion_id = $2`,
    [cliente_id, inscripcion_id]
  );
  if (!horarios.length) return;
  await pool.query(
    `INSERT INTO edu_inscripcion_horario (cliente_id, inscripcion_id, dia_semana, hora_inicio, hora_fin)
     SELECT $1, $2, d, hi::time, hf::time
       FROM UNNEST($3::smallint[], $4::text[], $5::text[]) AS t(d, hi, hf)`,
    [cliente_id, inscripcion_id, horarios.map((h) => h.dia_semana), horarios.map((h) => h.hora_inicio), horarios.map((h) => h.hora_fin)]
  );
};

/**
 * Turnos ocupados por un profesor o un alumno en un ciclo, de inscripciones
 * activas a `fecha`, sin contar la inscripción `excluirId`.
 */
const ocupados = async (cliente_id, { profesor_id = null, alumno_id = null, ciclo, fecha, excluirId = null }) => (await pool.query(
  `SELECT i.id AS inscripcion_id, i.clase_id, t.es_grupal,
          h.dia_semana, ${H('h.hora_inicio')} AS hora_inicio, ${H('h.hora_fin')} AS hora_fin,
          a.nombre || ' ' || a.apellido AS alumno, c.nombre AS clase
     FROM edu_inscripcion i
     JOIN edu_inscripcion_horario h ON h.inscripcion_id = i.id
     JOIN edu_clase c      ON c.id = i.clase_id
     JOIN edu_tipo_clase t ON t.id = c.tipo_clase_id
     JOIN edu_alumno a     ON a.id = i.alumno_id
    WHERE i.cliente_id = $1 AND i.ciclo = $2 AND ${ACTIVA('i', '$3')}
      AND ($4::int IS NULL OR i.profesor_id = $4)
      AND ($5::int IS NULL OR i.alumno_id = $5)
      AND ($6::int IS NULL OR i.id <> $6)`,
  [cliente_id, ciclo, fecha, profesor_id, alumno_id, excluirId]
)).rows;

/** Inscripciones activas que dependen de una persona o clase (para bloquear bajas). */
const contarActivas = async (cliente_id, campo, id, fecha) => {
  const col = { profesor: 'profesor_id', alumno: 'alumno_id', clase: 'clase_id' }[campo];
  if (!col) throw new Error(`campo inválido: ${campo}`);
  return (await pool.query(
    `SELECT count(*)::int AS n FROM edu_inscripcion i
      WHERE i.cliente_id = $1 AND i.${col} = $2 AND ${ACTIVA('i', '$3')}`,
    [cliente_id, id, fecha]
  )).rows[0].n;
};

/**
 * Agenda semanal: turnos de inscripciones activas. Filtros opcionales por
 * profesor, tutor (alumnos a su cargo) o alumno: los usa la vista propia.
 */
const agenda = async (cliente_id, { ciclo, fecha, profesor_id = null, tutor_id = null, alumno_id = null }) => (await pool.query(
  `SELECT h.dia_semana, ${H('h.hora_inicio')} AS hora_inicio, ${H('h.hora_fin')} AS hora_fin,
          i.id AS inscripcion_id, i.profesor_id, p.nombre || ' ' || p.apellido AS profesor,
          i.alumno_id, a.nombre || ' ' || a.apellido AS alumno,
          i.clase_id, c.nombre AS clase, t.es_grupal
     FROM edu_inscripcion i
     JOIN edu_inscripcion_horario h ON h.inscripcion_id = i.id
     JOIN edu_profesor p   ON p.id = i.profesor_id
     JOIN edu_alumno a     ON a.id = i.alumno_id
     JOIN edu_clase c      ON c.id = i.clase_id
     JOIN edu_tipo_clase t ON t.id = c.tipo_clase_id
    WHERE i.cliente_id = $1 AND i.ciclo = $2 AND ${ACTIVA('i', '$3')}
      AND ($4::int IS NULL OR i.profesor_id = $4)
      AND ($5::int IS NULL OR a.tutor_id = $5)
      AND ($6::int IS NULL OR i.alumno_id = $6)
    ORDER BY h.dia_semana, h.hora_inicio, p.apellido, a.apellido`,
  [cliente_id, ciclo, fecha, profesor_id, tutor_id, alumno_id]
)).rows;

module.exports = { listar, get, existeDuplicada, crear, actualizar, reemplazarHorarios, ocupados, contarActivas, agenda };
