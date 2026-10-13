// services/edu/reglas.js
//
// Reglas puras del catálogo de educación (sin base): fechas, edad, horarios,
// superposición y precio vigente. Se testean sin stubs.

const TZ = 'America/Argentina/Cordoba';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HORA_RE = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/;
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const PERIODO_RE = /^(\d{4})-(\d{2})(-\d{2})?$/;
const MAYORIA_EDAD = 18;

class EduError extends Error {
  constructor(message, { status = 400, code = 'EDU_INVALIDO', field, detalle } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.field = field;
    this.detalle = detalle;
  }
}

/** Fecha de hoy en Córdoba, 'YYYY-MM-DD'. */
const hoy = (now = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);

/** Valida 'YYYY-MM-DD' real (rechaza 2026-02-30). */
const esFecha = (s) => {
  if (typeof s !== 'string' || !FECHA_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

/** Edad cumplida a la fecha `ref` (ambas 'YYYY-MM-DD'). */
const edad = (fechaNacimiento, ref = hoy()) => {
  const [an, mn, dn] = fechaNacimiento.split('-').map(Number);
  const [ar, mr, dr] = ref.split('-').map(Number);
  let e = ar - an;
  if (mr < mn || (mr === mn && dr < dn)) e -= 1;
  return e;
};

const esMenor = (fechaNacimiento, ref = hoy()) => edad(fechaNacimiento, ref) < MAYORIA_EDAD;

/** 'YYYY-MM' o 'YYYY-MM-DD' → primer día del mes 'YYYY-MM-01'. */
const normalizarPeriodo = (valor) => {
  const m = PERIODO_RE.exec(String(valor ?? '').trim());
  if (!m) return null;
  const mes = Number(m[2]);
  if (mes < 1 || mes > 12) return null;
  return `${m[1]}-${m[2]}-01`;
};

const aMinutos = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** Normaliza y valida un horario. Devuelve { dia_semana, hora_inicio: 'HH:MM', hora_fin }. */
const normalizarHorario = (h, i = 0) => {
  const dia = Number(h?.dia_semana);
  const ini = String(h?.hora_inicio ?? '').trim();
  const fin = String(h?.hora_fin ?? '').trim();
  const field = `horarios[${i}]`;
  if (!Number.isInteger(dia) || dia < 1 || dia > 7) {
    throw new EduError('El día tiene que ser de 1 (lunes) a 7 (domingo)', { field });
  }
  if (!HORA_RE.test(ini) || !HORA_RE.test(fin)) {
    throw new EduError('Las horas van en formato HH:MM', { field });
  }
  const hora_inicio = ini.slice(0, 5);
  const hora_fin = fin.slice(0, 5);
  if (aMinutos(hora_fin) <= aMinutos(hora_inicio)) {
    throw new EduError('La hora de fin tiene que ser posterior a la de inicio', { field });
  }
  return { dia_semana: dia, hora_inicio, hora_fin };
};

const seSuperponen = (a, b) =>
  Number(a.dia_semana) === Number(b.dia_semana) &&
  aMinutos(String(a.hora_inicio).slice(0, 5)) < aMinutos(String(b.hora_fin).slice(0, 5)) &&
  aMinutos(String(b.hora_inicio).slice(0, 5)) < aMinutos(String(a.hora_fin).slice(0, 5));

const mismoTurno = (a, b) =>
  Number(a.dia_semana) === Number(b.dia_semana) &&
  String(a.hora_inicio).slice(0, 5) === String(b.hora_inicio).slice(0, 5) &&
  String(a.hora_fin).slice(0, 5) === String(b.hora_fin).slice(0, 5);

/** Valida una lista de horarios: al menos uno y sin superponerse entre sí. */
const validarHorarios = (horarios) => {
  if (!Array.isArray(horarios) || horarios.length === 0) {
    throw new EduError('Cargá al menos un horario', { field: 'horarios' });
  }
  if (horarios.length > 14) throw new EduError('Demasiados horarios', { field: 'horarios' });
  const norm = horarios.map(normalizarHorario);
  for (let i = 0; i < norm.length; i++) {
    for (let j = i + 1; j < norm.length; j++) {
      if (seSuperponen(norm[i], norm[j])) {
        throw new EduError('Hay horarios de la misma inscripción que se pisan', { field: `horarios[${j}]` });
      }
    }
  }
  return norm;
};

/**
 * Conflictos de una inscripción con lo que ya está ocupado.
 *
 * - Profesor: no puede tener dos turnos superpuestos, salvo un taller (clase
 *   grupal) en el que varios alumnos comparten exactamente el mismo turno de
 *   la misma clase. Ahí rige el cupo de la clase, si tiene.
 * - Alumno: no puede estar en dos lugares a la vez.
 *
 * `ocupadosProfesor` / `ocupadosAlumno`: horarios de otras inscripciones
 * activas del mismo ciclo, con { inscripcion_id, clase_id, es_grupal,
 * dia_semana, hora_inicio, hora_fin, alumno }.
 */
const buscarConflictos = (nuevos, { clase_id, es_grupal, cupo }, ocupadosProfesor = [], ocupadosAlumno = []) => {
  const conflictos = [];
  for (const h of nuevos) {
    const compartidos = new Set();
    for (const o of ocupadosProfesor) {
      if (!seSuperponen(h, o)) continue;
      const tallerCompartido = es_grupal && o.es_grupal && Number(o.clase_id) === Number(clase_id) && mismoTurno(h, o);
      if (tallerCompartido) {
        compartidos.add(o.inscripcion_id);
        continue;
      }
      conflictos.push({ motivo: 'PROFESOR_OCUPADO', horario: h, con: o });
    }
    if (cupo && compartidos.size >= Number(cupo)) {
      conflictos.push({ motivo: 'CUPO_COMPLETO', horario: h, cupo: Number(cupo) });
    }
    for (const o of ocupadosAlumno) {
      if (seSuperponen(h, o)) conflictos.push({ motivo: 'ALUMNO_OCUPADO', horario: h, con: o });
    }
  }
  return conflictos;
};

/** Precio vigente para un período: el último vigente_desde <= período. */
const resolverPrecioVigente = (precios, periodo) => {
  const p = normalizarPeriodo(periodo);
  if (!p) return null;
  return (precios || [])
    .map((x) => ({ ...x, desde: String(x.vigente_desde instanceof Date ? x.vigente_desde.toISOString() : x.vigente_desde).slice(0, 10) }))
    .filter((x) => x.desde <= p)
    .sort((a, b) => (a.desde < b.desde ? 1 : -1))[0] || null;
};

const texto = (v, { min = 1, max = 80 } = {}) => {
  const s = String(v ?? '').trim();
  return s.length >= min && s.length <= max ? s : null;
};

module.exports = {
  EduError,
  TZ,
  EMAIL_RE,
  MAYORIA_EDAD,
  hoy,
  esFecha,
  edad,
  esMenor,
  normalizarPeriodo,
  normalizarHorario,
  seSuperponen,
  mismoTurno,
  validarHorarios,
  buscarConflictos,
  resolverPrecioVigente,
  texto,
};
