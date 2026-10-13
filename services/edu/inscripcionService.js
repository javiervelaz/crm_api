// services/edu/inscripcionService.js — inscripciones, horarios y agenda.
const db = require('../../model/edu/inscripciones');
const catalogoDb = require('../../model/edu/catalogo');
const personasDb = require('../../model/edu/personas');
const { EduError, hoy, esFecha, validarHorarios, buscarConflictos } = require('./reglas');

const noEncontrada = () => new EduError('Inscripción no encontrada', { status: 404, code: 'NOT_FOUND' });

const idDe = (v, field) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new EduError(`${field} inválido`, { field });
  return n;
};

const cicloDe = (v, fecha) => {
  if (v === undefined || v === null || v === '') return Number(fecha.slice(0, 4));
  const n = Number(v);
  if (!Number.isInteger(n) || n < 2000 || n > 2100) throw new EduError('Ciclo inválido (año)', { field: 'ciclo' });
  return n;
};

const MENSAJES = {
  PROFESOR_OCUPADO: (c) => `El profesor ya tiene clase el día ${c.horario.dia_semana} de ${c.con.hora_inicio} a ${c.con.hora_fin} (${c.con.alumno}, ${c.con.clase})`,
  ALUMNO_OCUPADO: (c) => `El alumno ya tiene ${c.con.clase} el día ${c.horario.dia_semana} de ${c.con.hora_inicio} a ${c.con.hora_fin}`,
  CUPO_COMPLETO: (c) => `El taller ya tiene el cupo completo (${c.cupo}) el día ${c.horario.dia_semana} a las ${c.horario.hora_inicio}`,
};

/** Rechaza con 409 si los horarios pisan al profesor o al alumno. */
const verificarDisponibilidad = async (cliente_id, { horarios, clase, profesor_id, alumno_id, ciclo, excluirId }) => {
  const fecha = hoy();
  const [ocupadosProfesor, ocupadosAlumno] = await Promise.all([
    db.ocupados(cliente_id, { profesor_id, ciclo, fecha, excluirId }),
    db.ocupados(cliente_id, { alumno_id, ciclo, fecha, excluirId }),
  ]);
  const conflictos = buscarConflictos(
    horarios, { clase_id: clase.id, es_grupal: clase.es_grupal, cupo: clase.cupo }, ocupadosProfesor, ocupadosAlumno
  );
  if (conflictos.length) {
    const c = conflictos[0];
    throw new EduError(MENSAJES[c.motivo](c), {
      status: 409,
      code: c.motivo === 'CUPO_COMPLETO' ? 'CUPO_COMPLETO' : 'HORARIO_SUPERPUESTO',
      field: 'horarios',
      detalle: conflictos.map((x) => ({
        motivo: x.motivo,
        horario: x.horario,
        ...(x.con ? { inscripcion_id: x.con.inscripcion_id, alumno: x.con.alumno, clase: x.con.clase, hora_inicio: x.con.hora_inicio, hora_fin: x.con.hora_fin } : {}),
      })),
    });
  }
};

const claseActiva = async (cliente_id, clase_id) => {
  const clase = await catalogoDb.getClase(cliente_id, clase_id, hoy());
  if (!clase) throw new EduError('Clase no encontrada', { field: 'clase_id' });
  if (!clase.activa) throw new EduError('La clase está inactiva', { field: 'clase_id' });
  return clase;
};

const personaActiva = async (entidad, cliente_id, id) => {
  const p = await personasDb.get(entidad, cliente_id, id, hoy());
  if (!p) throw new EduError(`${entidad === 'profesor' ? 'Profesor' : 'Alumno'} no encontrado`, { field: `${entidad}_id` });
  if (!p.activo) throw new EduError(`${entidad === 'profesor' ? 'El profesor' : 'El alumno'} está inactivo`, { field: `${entidad}_id` });
  return p;
};

const listar = (cliente_id, q = {}) => db.listar(cliente_id, {
  ciclo: q.ciclo ? Number(q.ciclo) || -1 : null,
  profesor_id: q.profesor_id ? Number(q.profesor_id) || -1 : null,
  alumno_id: q.alumno_id ? Number(q.alumno_id) || -1 : null,
  clase_id: q.clase_id ? Number(q.clase_id) || -1 : null,
  activasAl: q.todas === 'true' ? null : hoy(),
});

/** Vista propia: el alcance (profesor, tutor o alumno) filtra siempre. */
const listarPropias = (cliente_id, q = {}, alcance) => db.listar(cliente_id, {
  ciclo: q.ciclo ? Number(q.ciclo) || -1 : null,
  activasAl: q.todas === 'true' ? null : hoy(),
}, alcance);

const get = async (cliente_id, id, alcance = {}) => {
  const i = await db.get(cliente_id, id, alcance);
  if (!i) throw noEncontrada();
  return i;
};

const crear = async (cliente_id, body = {}) => {
  const alumno_id = idDe(body.alumno_id, 'alumno_id');
  const clase_id = idDe(body.clase_id, 'clase_id');
  const profesor_id = idDe(body.profesor_id, 'profesor_id');
  const fecha_alta = body.fecha_alta ?? hoy();
  if (!esFecha(fecha_alta)) throw new EduError('Fecha de alta inválida (AAAA-MM-DD)', { field: 'fecha_alta' });
  const ciclo = cicloDe(body.ciclo, fecha_alta);
  const horarios = validarHorarios(body.horarios);

  await personaActiva('alumno', cliente_id, alumno_id);
  await personaActiva('profesor', cliente_id, profesor_id);
  const clase = await claseActiva(cliente_id, clase_id);

  if (await db.existeDuplicada(cliente_id, { alumno_id, clase_id, ciclo })) {
    throw new EduError('El alumno ya está inscripto en esa clase para ese ciclo', { status: 409, code: 'INSCRIPCION_DUPLICADA' });
  }
  await verificarDisponibilidad(cliente_id, { horarios, clase, profesor_id, alumno_id, ciclo });

  const { id } = await db.crear(cliente_id, { alumno_id, clase_id, profesor_id, ciclo, fecha_alta });
  await db.reemplazarHorarios(cliente_id, id, horarios);
  return get(cliente_id, id);
};

/** Cambia profesor y/o fechas. Cambiar de profesor revalida los horarios. */
const actualizar = async (cliente_id, id, body = {}) => {
  const actual = await get(cliente_id, id);
  const profesor_id = body.profesor_id !== undefined ? idDe(body.profesor_id, 'profesor_id') : actual.profesor_id;
  const fecha_alta = body.fecha_alta ?? actual.fecha_alta;
  if (!esFecha(fecha_alta)) throw new EduError('Fecha de alta inválida (AAAA-MM-DD)', { field: 'fecha_alta' });
  const fecha_baja = body.fecha_baja !== undefined ? body.fecha_baja : actual.fecha_baja;
  if (fecha_baja !== null && !esFecha(fecha_baja)) throw new EduError('Fecha de baja inválida (AAAA-MM-DD)', { field: 'fecha_baja' });
  if (fecha_baja !== null && fecha_baja < fecha_alta) {
    throw new EduError('La fecha de baja no puede ser anterior a la de alta', { field: 'fecha_baja' });
  }
  if (profesor_id !== actual.profesor_id) {
    await personaActiva('profesor', cliente_id, profesor_id);
    const clase = await catalogoDb.getClase(cliente_id, actual.clase_id, hoy());
    await verificarDisponibilidad(cliente_id, {
      horarios: actual.horarios, clase, profesor_id, alumno_id: actual.alumno_id, ciclo: actual.ciclo, excluirId: id,
    });
  }
  // Reactivar (sacar la baja) vuelve a ocupar los turnos: se revalida.
  if (actual.fecha_baja !== null && fecha_baja === null) {
    const clase = await catalogoDb.getClase(cliente_id, actual.clase_id, hoy());
    await verificarDisponibilidad(cliente_id, {
      horarios: actual.horarios, clase, profesor_id, alumno_id: actual.alumno_id, ciclo: actual.ciclo, excluirId: id,
    });
  }
  await db.actualizar(cliente_id, id, { profesor_id, fecha_alta, fecha_baja });
  return get(cliente_id, id);
};

const darDeBaja = async (cliente_id, id, body = {}) => {
  const actual = await get(cliente_id, id);
  if (actual.fecha_baja) throw new EduError('La inscripción ya tiene baja', { status: 409, code: 'YA_DADA_DE_BAJA' });
  return actualizar(cliente_id, id, { fecha_baja: body.fecha_baja ?? hoy() });
};

/** Reemplaza los horarios de una inscripción (se ajustan durante el año). */
const actualizarHorarios = async (cliente_id, id, body = {}) => {
  const actual = await get(cliente_id, id);
  if (actual.fecha_baja && actual.fecha_baja < hoy()) {
    throw new EduError('La inscripción está dada de baja', { status: 409, code: 'INSCRIPCION_DE_BAJA' });
  }
  const horarios = validarHorarios(body.horarios);
  const clase = await catalogoDb.getClase(cliente_id, actual.clase_id, hoy());
  await verificarDisponibilidad(cliente_id, {
    horarios, clase, profesor_id: actual.profesor_id, alumno_id: actual.alumno_id, ciclo: actual.ciclo, excluirId: id,
  });
  await db.reemplazarHorarios(cliente_id, id, horarios);
  return get(cliente_id, id);
};

const agenda = (cliente_id, q = {}, alcance = {}) => {
  const fecha = hoy();
  return db.agenda(cliente_id, {
    ciclo: q.ciclo ? Number(q.ciclo) || -1 : Number(fecha.slice(0, 4)),
    fecha,
    profesor_id: alcance.profesor_id ?? (q.profesor_id ? Number(q.profesor_id) || -1 : null),
  });
};

module.exports = { listar, listarPropias, get, crear, actualizar, darDeBaja, actualizarHorarios, agenda, verificarDisponibilidad };
