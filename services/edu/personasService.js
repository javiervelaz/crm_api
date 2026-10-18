// services/edu/personasService.js — profesores, tutores y alumnos.
//
// El acceso al sistema es opcional y usa las credenciales de la etapa 3
// (contraseña temporal + cambio obligatorio). El alumno menor no tiene acceso
// propio: entra su tutor.
const db = require('../../model/edu/personas');
const inscDb = require('../../model/edu/inscripciones');
const cuentaService = require('../cuenta/cuentaService');
const { EduError, EMAIL_RE, MAYORIA_EDAD, hoy, esFecha, edad, texto } = require('./reglas');

const TIPO_USUARIO = { profesor: 'PROF', tutor: 'TUT', alumno: 'ALU' };
const NOMBRE = { profesor: 'Profesor', tutor: 'Tutor', alumno: 'Alumno' };

const noEncontrado = (entidad) => new EduError(`${NOMBRE[entidad]} no encontrado`, { status: 404, code: 'NOT_FOUND' });

const telefonoDe = (v) => {
  if (v === undefined || v === null || String(v).trim() === '') return null;
  const t = String(v).trim();
  if (t.length > 30 || !/^[\d\s()+-]+$/.test(t)) throw new EduError('Teléfono inválido', { field: 'telefono' });
  return t;
};

const emailDe = (v) => {
  if (v === undefined || v === null || String(v).trim() === '') return null;
  const e = String(v).trim().toLowerCase();
  if (e.length > 150 || !EMAIL_RE.test(e)) throw new EduError('Email inválido', { field: 'email' });
  return e;
};

const valor = (body, actual, campo) => (body[campo] !== undefined ? body[campo] : actual?.[campo]);

/** Valida y arma los datos de una persona (alta o edición sobre `actual`). */
const datosPersona = async (entidad, cliente_id, body, actual = null) => {
  const nombre = texto(valor(body, actual, 'nombre'), { min: 2, max: 80 });
  if (!nombre) throw new EduError('Nombre inválido', { field: 'nombre' });
  const apellido = texto(valor(body, actual, 'apellido'), { min: 2, max: 80 });
  if (!apellido) throw new EduError('Apellido inválido', { field: 'apellido' });
  const telefono = telefonoDe(valor(body, actual, 'telefono'));
  if (entidad === 'tutor' && !telefono) throw new EduError('El teléfono del tutor es obligatorio', { field: 'telefono' });
  const email = emailDe(valor(body, actual, 'email'));
  const activo = typeof body.activo === 'boolean' ? body.activo : actual?.activo ?? true;
  const d = { nombre, apellido, telefono, email, activo };

  if (entidad === 'alumno') {
    const fecha_nacimiento = valor(body, actual, 'fecha_nacimiento');
    if (!esFecha(fecha_nacimiento)) throw new EduError('Fecha de nacimiento inválida (AAAA-MM-DD)', { field: 'fecha_nacimiento' });
    const años = edad(fecha_nacimiento, hoy());
    if (años < 0 || años > 110) throw new EduError('Fecha de nacimiento fuera de rango', { field: 'fecha_nacimiento' });

    let tutor_id = valor(body, actual, 'tutor_id');
    tutor_id = tutor_id === null || tutor_id === undefined || tutor_id === '' ? null : Number(tutor_id);
    if (tutor_id !== null) {
      const tutor = Number.isInteger(tutor_id) ? await db.get('tutor', cliente_id, tutor_id, hoy()) : null;
      if (!tutor) throw new EduError('Tutor no encontrado', { field: 'tutor_id' });
      if (!tutor.activo && tutor.id !== actual?.tutor_id) throw new EduError('El tutor está inactivo', { field: 'tutor_id' });
    }
    if (años < MAYORIA_EDAD && tutor_id === null) {
      throw new EduError(`Un alumno menor de ${MAYORIA_EDAD} años necesita un tutor`, { code: 'MENOR_SIN_TUTOR', field: 'tutor_id' });
    }
    if (tutor_id !== null && actual?.user_id) {
      throw new EduError('El alumno tiene acceso propio: no puede tener tutor', { code: 'ACCESO_DUPLICADO', field: 'tutor_id' });
    }
    Object.assign(d, { fecha_nacimiento, tutor_id });
  }
  return d;
};

const conEdad = (entidad, p) => (entidad === 'alumno' && p
  ? { ...p, edad: edad(p.fecha_nacimiento, hoy()), es_menor: edad(p.fecha_nacimiento, hoy()) < MAYORIA_EDAD }
  : p);

const listar = async (entidad, cliente_id, q = {}) => {
  const activo = q.activo === 'true' ? true : q.activo === 'false' ? false : null;
  const tutor_id = q.tutor_id ? Number(q.tutor_id) || -1 : null;
  const rows = await db.listar(entidad, cliente_id, {
    hoy: hoy(), q: q.q ? String(q.q).trim().slice(0, 80) : null, activo, tutor_id,
  });
  return rows.map((r) => conEdad(entidad, r));
};

const get = async (entidad, cliente_id, id) => {
  const p = await db.get(entidad, cliente_id, id, hoy());
  if (!p) throw noEncontrado(entidad);
  const extra = {};
  if (entidad === 'tutor') extra.alumnos = (await db.listar('alumno', cliente_id, { hoy: hoy(), tutor_id: id })).map((a) => conEdad('alumno', a));
  if (entidad !== 'tutor') {
    extra.inscripciones = await inscDb.listar(cliente_id, { [`${entidad}_id`]: id, activasAl: hoy() });
  }
  return { ...conEdad(entidad, p), ...extra };
};

/** Crea las credenciales (etapa 3) y vincula el usuario a la persona. */
const crearAcceso = async (entidad, cliente_id, id, body = {}) => {
  const p = await db.get(entidad, cliente_id, id, hoy());
  if (!p) throw noEncontrado(entidad);
  if (p.user_id) throw new EduError('Ya tiene acceso al sistema', { status: 409, code: 'YA_TIENE_ACCESO' });
  if (!p.activo) throw new EduError(`${NOMBRE[entidad]} inactivo`, { status: 409, code: 'INACTIVO' });
  if (entidad === 'alumno') {
    if (edad(p.fecha_nacimiento, hoy()) < MAYORIA_EDAD) {
      throw new EduError('Un alumno menor entra con el acceso de su tutor', { code: 'ALUMNO_MENOR' });
    }
    if (p.tutor_id) throw new EduError('El alumno tiene tutor: entra con el acceso del tutor', { code: 'ACCESO_DUPLICADO' });
  }
  const email = emailDe(body.email ?? p.email);
  if (!email) throw new EduError('Para dar acceso hace falta un email', { field: 'email' });

  const { user, passwordTemporal } = await cuentaService.crearCredencialesService(cliente_id, {
    nombre: p.nombre, apellido: p.apellido, email, telefono: p.telefono, tipo: TIPO_USUARIO[entidad],
  });
  if (!(await db.setUserId(entidad, cliente_id, id, user.id))) {
    throw new EduError('No se pudo vincular el acceso', { status: 409, code: 'YA_TIENE_ACCESO' });
  }
  if (email !== p.email) await db.actualizar(entidad, cliente_id, id, { ...p, email });
  return { user_id: user.id, email, passwordTemporal };
};

const crear = async (entidad, cliente_id, body = {}) => {
  const d = await datosPersona(entidad, cliente_id, body);
  if (body.crear_acceso === true && !d.email) {
    throw new EduError('Para dar acceso hace falta un email', { field: 'email' });
  }
  const { id } = await db.crear(entidad, cliente_id, d);
  const acceso = body.crear_acceso === true ? await crearAcceso(entidad, cliente_id, id) : null;
  return { ...(await get(entidad, cliente_id, id)), ...(acceso ? { acceso } : {}) };
};

const actualizar = async (entidad, cliente_id, id, body = {}) => {
  const actual = await db.get(entidad, cliente_id, id, hoy());
  if (!actual) throw noEncontrado(entidad);
  const d = await datosPersona(entidad, cliente_id, body, actual);
  if (actual.activo && !d.activo) await validarBaja(entidad, cliente_id, id);
  await db.actualizar(entidad, cliente_id, id, d);
  return get(entidad, cliente_id, id);
};

const validarBaja = async (entidad, cliente_id, id) => {
  if (entidad === 'tutor') {
    if ((await db.alumnosActivosDeTutor(cliente_id, id)) > 0) {
      throw new EduError('El tutor tiene alumnos activos', { status: 409, code: 'TIENE_ALUMNOS' });
    }
    return;
  }
  if ((await inscDb.contarActivas(cliente_id, entidad, id, hoy())) > 0) {
    throw new EduError(`El ${entidad} tiene inscripciones activas: dalas de baja primero`, { status: 409, code: 'TIENE_INSCRIPCIONES' });
  }
};

/** Baja lógica. */
const desactivar = async (entidad, cliente_id, id) => {
  const actual = await db.get(entidad, cliente_id, id, hoy());
  if (!actual) throw noEncontrado(entidad);
  if (actual.activo) await validarBaja(entidad, cliente_id, id);
  await db.setActivo(entidad, cliente_id, id, false);
  return get(entidad, cliente_id, id);
};

module.exports = { TIPO_USUARIO, listar, get, crear, actualizar, desactivar, crearAcceso, datosPersona };
