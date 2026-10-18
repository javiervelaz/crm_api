// model/edu/cuotas.js — cuotas y pagos. SQL puro; siempre filtra por cliente_id.
const pool = require('../../pool');

const D = (col) => `to_char(${col}, 'YYYY-MM-DD')`;
const H = (col) => `to_char(${col}, 'HH24:MI')`;

// ─── Config e inscripciones a facturar ────────────────────────────────────
const configAlumnos = async (cliente_id) => (await pool.query(
  `SELECT config FROM modulo
    WHERE cliente_id = $1 AND codigo = 'alumnos' AND status = true AND deleted_at IS NULL
    LIMIT 1`,
  [cliente_id]
)).rows[0]?.config ?? null;

/** Tenants con el módulo alumnos activo (cron). */
const clientesConAlumnos = async () => (await pool.query(
  `SELECT DISTINCT cliente_id FROM modulo
    WHERE codigo = 'alumnos' AND status = true AND deleted_at IS NULL
    ORDER BY cliente_id`
)).rows.map((r) => r.cliente_id);

/**
 * Inscripciones vigentes en el mes, con el precio mensual que rige a ese mes
 * (último vigente_desde <= período) y sus horarios.
 */
const inscripcionesDelPeriodo = async (cliente_id, periodo, ultimoDia, alumno_id = null) => (await pool.query(
  `SELECT i.id, i.alumno_id, ${D('i.fecha_alta')} AS fecha_alta, ${D('i.fecha_baja')} AS fecha_baja,
          (SELECT p.importe_mensual FROM edu_clase_precio p
            WHERE p.cliente_id = i.cliente_id AND p.clase_id = i.clase_id AND p.vigente_desde <= $2::date
            ORDER BY p.vigente_desde DESC LIMIT 1) AS precio,
          COALESCE((SELECT json_agg(json_build_object('dia_semana', h.dia_semana,
                                    'hora_inicio', ${H('h.hora_inicio')}, 'hora_fin', ${H('h.hora_fin')}))
                      FROM edu_inscripcion_horario h
                     WHERE h.inscripcion_id = i.id AND h.cliente_id = i.cliente_id), '[]'::json) AS horarios,
          c.nombre AS clase
     FROM edu_inscripcion i
     JOIN edu_alumno a ON a.id = i.alumno_id AND a.cliente_id = i.cliente_id
     JOIN edu_clase c  ON c.id = i.clase_id  AND c.cliente_id = i.cliente_id
    WHERE i.cliente_id = $1
      AND i.fecha_alta <= $3::date
      AND (i.fecha_baja IS NULL OR i.fecha_baja >= $2::date)
      AND a.activo = true
      AND ($4::int IS NULL OR i.alumno_id = $4)
    ORDER BY i.alumno_id, i.fecha_alta, i.id`,
  [cliente_id, periodo, ultimoDia, alumno_id]
)).rows;

const cuotasExistentes = async (cliente_id, periodo, inscripcionIds) => (await pool.query(
  `SELECT inscripcion_id FROM edu_cuota
    WHERE cliente_id = $1 AND periodo = $2::date AND inscripcion_id = ANY($3::int[])`,
  [cliente_id, periodo, inscripcionIds]
)).rows.map((r) => r.inscripcion_id);

/** Idempotente: si ya existe la cuota de esa inscripción y mes, no hace nada (null). */
const insertarCuota = async (cliente_id, c) => (await pool.query(
  `INSERT INTO edu_cuota (cliente_id, inscripcion_id, alumno_id, periodo, tipo, importe_base,
                          clases_mes, clases_cobradas, descuento_pct, importe, vence)
   VALUES ($1, $2, $3, $4::date, $5, $6, $7, $8, $9, $10, $11::date)
   ON CONFLICT (inscripcion_id, periodo) DO NOTHING
   RETURNING id`,
  [cliente_id, c.inscripcion_id, c.alumno_id, c.periodo, c.tipo, c.importe_base,
    c.clases_mes, c.clases_cobradas, c.descuento_pct, c.importe, c.vence]
)).rows[0] || null;

// ─── Consulta de cuotas ───────────────────────────────────────────────────
const CUOTA_SELECT = `
  SELECT q.id, q.inscripcion_id, q.alumno_id, ${D('q.periodo')} AS periodo, q.tipo,
         q.importe_base, q.clases_mes, q.clases_cobradas, q.descuento_pct, q.importe,
         ${D('q.vence')} AS vence, q.estado,
         a.nombre || ' ' || a.apellido AS alumno, a.tutor_id,
         c.nombre AS clase
    FROM edu_cuota q
    JOIN edu_alumno a      ON a.id = q.alumno_id      AND a.cliente_id = q.cliente_id
    JOIN edu_inscripcion i ON i.id = q.inscripcion_id AND i.cliente_id = q.cliente_id
    JOIN edu_clase c       ON c.id = i.clase_id       AND c.cliente_id = q.cliente_id`;

/** alcance: { tutor_id } | { alumno_id } (vista propia). */
const listarCuotas = async (cliente_id, f = {}, alcance = {}) => (await pool.query(
  `${CUOTA_SELECT}
    WHERE q.cliente_id = $1
      AND ($2::date IS NULL OR q.periodo = $2::date)
      AND ($3::int  IS NULL OR q.alumno_id = $3)
      AND ($4::text IS NULL OR q.estado = $4)
      AND ($5::int  IS NULL OR a.tutor_id = $5)
      AND ($6::int  IS NULL OR q.alumno_id = $6)
    ORDER BY q.periodo DESC, a.apellido, a.nombre, c.nombre`,
  [cliente_id, f.periodo ?? null, f.alumno_id ?? null, f.estado ?? null,
    alcance.tutor_id ?? null, alcance.alumno_id ?? null]
)).rows;

/** Cuotas por id, filtradas por tenant y alcance. `bloquear` toma FOR UPDATE (aprobaciones y altas de pago). */
const cuotasPorIds = async (cliente_id, ids, alcance = {}, bloquear = false) => (await pool.query(
  `SELECT q.id, q.alumno_id, ${D('q.periodo')} AS periodo, q.importe, ${D('q.vence')} AS vence, q.estado
     FROM edu_cuota q
     JOIN edu_alumno a ON a.id = q.alumno_id AND a.cliente_id = q.cliente_id
    WHERE q.cliente_id = $1 AND q.id = ANY($2::int[])
      AND ($3::int IS NULL OR a.tutor_id = $3)
      AND ($4::int IS NULL OR q.alumno_id = $4)
    ORDER BY q.id
    ${bloquear ? 'FOR UPDATE OF q' : ''}`,
  [cliente_id, ids, alcance.tutor_id ?? null, alcance.alumno_id ?? null]
)).rows;

const setEstadoCuotas = async (cliente_id, ids, estado) => (await pool.query(
  `UPDATE edu_cuota SET estado = $3, updated_at = CURRENT_TIMESTAMP
    WHERE cliente_id = $1 AND id = ANY($2::int[])`,
  [cliente_id, ids, estado]
)).rowCount;

// ─── Pagos ────────────────────────────────────────────────────────────────
const insertarPago = async (cliente_id, p) => (await pool.query(
  `INSERT INTO edu_pago (cliente_id, origen, estado, pagador_user_id, fecha_pago, importe_total,
                         medio_pago, observacion, fuera_de_termino,
                         comprobante_provider, comprobante_key, comprobante_meta,
                         comprobante_nombre, comprobante_mime, revisado_por, revisado_at)
   VALUES ($1, $2, $3, $4, $5::date, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14, $15,
           CASE WHEN $15::int IS NOT NULL THEN CURRENT_TIMESTAMP END)
   RETURNING id`,
  [cliente_id, p.origen, p.estado, p.pagador_user_id ?? null, p.fecha_pago ?? null, p.importe_total ?? null,
    p.medio_pago ?? null, p.observacion ?? null, p.fuera_de_termino ?? false,
    p.comprobante?.provider ?? null, p.comprobante?.key ?? null,
    p.comprobante?.meta ? JSON.stringify(p.comprobante.meta) : null,
    p.comprobante?.nombre ?? null, p.comprobante?.mime ?? null, p.revisado_por ?? null]
)).rows[0];

const insertarLineas = async (cliente_id, pago_id, lineas) => {
  for (const l of lineas) {
    await pool.query(
      `INSERT INTO edu_pago_cuota (cliente_id, pago_id, cuota_id, importe, recargo_pct, recargo_importe, total)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [cliente_id, pago_id, l.cuota_id, l.importe, l.recargo_pct ?? null, l.recargo_importe ?? null, l.total ?? null]
    );
  }
};

const actualizarLinea = async (cliente_id, pago_id, l) => (await pool.query(
  `UPDATE edu_pago_cuota SET recargo_pct = $4, recargo_importe = $5, total = $6
    WHERE cliente_id = $1 AND pago_id = $2 AND cuota_id = $3`,
  [cliente_id, pago_id, l.cuota_id, l.recargo_pct, l.recargo_importe, l.total]
)).rowCount;

const PAGO_SELECT = `
  SELECT p.id, p.origen, p.estado, p.pagador_user_id, ${D('p.fecha_pago')} AS fecha_pago, p.importe_total,
         p.medio_pago, p.observacion, p.fuera_de_termino, p.comprobante_nombre, p.comprobante_mime,
         (p.comprobante_key IS NOT NULL) AS tiene_comprobante, p.motivo_rechazo,
         p.revisado_por, p.revisado_at, p.created_at,
         COALESCE((SELECT json_agg(json_build_object(
                     'cuota_id', pc.cuota_id, 'importe', pc.importe, 'recargo_pct', pc.recargo_pct,
                     'recargo_importe', pc.recargo_importe, 'total', pc.total,
                     'periodo', ${D('q.periodo')}, 'alumno', a.nombre || ' ' || a.apellido,
                     'clase', c.nombre, 'vence', ${D('q.vence')}) ORDER BY q.periodo, pc.id)
                     FROM edu_pago_cuota pc
                     JOIN edu_cuota q       ON q.id = pc.cuota_id
                     JOIN edu_alumno a      ON a.id = q.alumno_id
                     JOIN edu_inscripcion i ON i.id = q.inscripcion_id
                     JOIN edu_clase c       ON c.id = i.clase_id
                    WHERE pc.pago_id = p.id AND pc.cliente_id = p.cliente_id), '[]'::json) AS cuotas
    FROM edu_pago p`;

const listarPagos = async (cliente_id, f = {}, pagador_user_id = null) => (await pool.query(
  `${PAGO_SELECT}
    WHERE p.cliente_id = $1
      AND ($2::text IS NULL OR p.estado = $2)
      AND ($3::int  IS NULL OR p.pagador_user_id = $3)
    ORDER BY (p.estado = 'pendiente') DESC, p.created_at DESC
    LIMIT 200`,
  [cliente_id, f.estado ?? null, pagador_user_id]
)).rows;

/** `bloquear`: FOR UPDATE, para aprobar/rechazar sin pisarse con otra revisión. */
const getPago = async (cliente_id, id, pagador_user_id = null, bloquear = false) => (await pool.query(
  `${PAGO_SELECT}
    WHERE p.cliente_id = $1 AND p.id = $2 AND ($3::int IS NULL OR p.pagador_user_id = $3)
    ${bloquear ? 'FOR UPDATE OF p' : ''}`,
  [cliente_id, id, pagador_user_id]
)).rows[0] || null;

const getComprobante = async (cliente_id, id, pagador_user_id = null) => (await pool.query(
  `SELECT comprobante_provider AS provider, comprobante_key AS key, comprobante_meta AS meta,
          comprobante_nombre AS nombre, comprobante_mime AS mime
     FROM edu_pago
    WHERE cliente_id = $1 AND id = $2 AND comprobante_key IS NOT NULL
      AND ($3::int IS NULL OR pagador_user_id = $3)`,
  [cliente_id, id, pagador_user_id]
)).rows[0] || null;

const cuotasDePago = async (cliente_id, pago_id, bloquear = true) => (await pool.query(
  `SELECT q.id, q.alumno_id, ${D('q.periodo')} AS periodo, q.importe, ${D('q.vence')} AS vence, q.estado
     FROM edu_pago_cuota pc JOIN edu_cuota q ON q.id = pc.cuota_id
    WHERE pc.cliente_id = $1 AND pc.pago_id = $2
    ORDER BY q.id
    ${bloquear ? 'FOR UPDATE OF q' : ''}`,
  [cliente_id, pago_id]
)).rows;

const aprobarPago = async (cliente_id, id, { fecha_pago, importe_total, revisado_por, medio_pago, observacion }) => (await pool.query(
  `UPDATE edu_pago
      SET estado = 'aprobado', fecha_pago = $3::date, importe_total = $4, revisado_por = $5,
          revisado_at = CURRENT_TIMESTAMP, medio_pago = COALESCE($6, medio_pago),
          observacion = COALESCE($7, observacion)
    WHERE cliente_id = $1 AND id = $2 AND estado = 'pendiente'`,
  [cliente_id, id, fecha_pago, importe_total, revisado_por, medio_pago ?? null, observacion ?? null]
)).rowCount;

const rechazarPago = async (cliente_id, id, { motivo, revisado_por }) => (await pool.query(
  `UPDATE edu_pago
      SET estado = 'rechazado', motivo_rechazo = $3, revisado_por = $4, revisado_at = CURRENT_TIMESTAMP
    WHERE cliente_id = $1 AND id = $2 AND estado = 'pendiente'`,
  [cliente_id, id, motivo, revisado_por]
)).rowCount;

// ─── Notificación al admin (n8n) ──────────────────────────────────────────
/** Pagos pendientes de revisión que todavía no se avisaron, de todos los tenants. */
const pendientesSinNotificar = async () => (await pool.query(
  `SELECT p.id, p.cliente_id, p.fuera_de_termino, ${D('p.fecha_pago')} AS fecha_pago, p.created_at,
          (SELECT string_agg(DISTINCT a.nombre || ' ' || a.apellido, ', ')
             FROM edu_pago_cuota pc JOIN edu_cuota q ON q.id = pc.cuota_id
             JOIN edu_alumno a ON a.id = q.alumno_id
            WHERE pc.pago_id = p.id) AS alumnos,
          (SELECT COALESCE(SUM(pc.importe), 0) FROM edu_pago_cuota pc WHERE pc.pago_id = p.id) AS importe
     FROM edu_pago p
    WHERE p.estado = 'pendiente' AND p.notificado_at IS NULL
    ORDER BY p.cliente_id, p.created_at
    LIMIT 500`
)).rows;

const marcarNotificados = async (ids) => (await pool.query(
  `UPDATE edu_pago SET notificado_at = CURRENT_TIMESTAMP
    WHERE id = ANY($1::int[]) AND notificado_at IS NULL`,
  [ids]
)).rowCount;

const contarPendientes = async (cliente_id) => (await pool.query(
  `SELECT count(*)::int AS n FROM edu_pago WHERE cliente_id = $1 AND estado = 'pendiente'`,
  [cliente_id]
)).rows[0].n;

module.exports = {
  configAlumnos, clientesConAlumnos, inscripcionesDelPeriodo, cuotasExistentes, insertarCuota,
  listarCuotas, cuotasPorIds, setEstadoCuotas,
  insertarPago, insertarLineas, actualizarLinea, listarPagos, getPago, getComprobante, cuotasDePago,
  aprobarPago, rechazarPago, pendientesSinNotificar, marcarNotificados, contarPendientes,
};
