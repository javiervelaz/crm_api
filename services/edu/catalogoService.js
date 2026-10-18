// services/edu/catalogoService.js — tipos de clase, clases y precios.
const db = require('../../model/edu/catalogo');
const { EduError, hoy, normalizarPeriodo, resolverPrecioVigente, texto } = require('./reglas');

const NO_ENCONTRADA = (que) => new EduError(`${que} no encontrado`, { status: 404, code: 'NOT_FOUND' });

const importe = (v, field, { requerido = true } = {}) => {
  if (v === undefined || v === null || v === '') {
    if (requerido) throw new EduError('El importe es obligatorio', { field });
    return null;
  }
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0 || n > 9_999_999_999) throw new EduError('Importe inválido', { field });
  return Math.round(n * 100) / 100;
};

// ─── Tipos de clase ─────────────────────────────────────────────────────────
const listarTipos = (cliente_id) => db.listarTipos(cliente_id);

const crearTipo = async (cliente_id, body = {}) => {
  const nombre = texto(body.nombre, { min: 2, max: 60 });
  if (!nombre) throw new EduError('Nombre inválido', { field: 'nombre' });
  if (await db.tipoPorNombre(cliente_id, nombre)) {
    throw new EduError('Ya existe un tipo de clase con ese nombre', { status: 409, code: 'DUPLICADO', field: 'nombre' });
  }
  return db.crearTipo(cliente_id, { nombre, es_grupal: body.es_grupal === true });
};

const actualizarTipo = async (cliente_id, id, body = {}) => {
  const actual = await db.getTipo(cliente_id, id);
  if (!actual) throw NO_ENCONTRADA('Tipo de clase');
  let nombre = null;
  if (body.nombre !== undefined) {
    nombre = texto(body.nombre, { min: 2, max: 60 });
    if (!nombre) throw new EduError('Nombre inválido', { field: 'nombre' });
    if (await db.tipoPorNombre(cliente_id, nombre, id)) {
      throw new EduError('Ya existe un tipo de clase con ese nombre', { status: 409, code: 'DUPLICADO', field: 'nombre' });
    }
  }
  const es_grupal = typeof body.es_grupal === 'boolean' ? body.es_grupal : null;
  if (es_grupal !== null && es_grupal !== actual.es_grupal && (await db.tipoEnUso(cliente_id, id))) {
    throw new EduError('No se puede cambiar si es grupal: hay clases de este tipo', { status: 409, code: 'EN_USO', field: 'es_grupal' });
  }
  const activo = typeof body.activo === 'boolean' ? body.activo : null;
  return db.actualizarTipo(cliente_id, id, { nombre, es_grupal, activo });
};

// ─── Clases ─────────────────────────────────────────────────────────────────
const listarClases = (cliente_id, { activas } = {}) =>
  db.listarClases(cliente_id, { hoy: hoy(), soloActivas: activas === true });

const getClase = async (cliente_id, id) => {
  const clase = await db.getClase(cliente_id, id, hoy());
  if (!clase) throw NO_ENCONTRADA('Clase');
  return { ...clase, precios: await db.listarPrecios(cliente_id, id) };
};

const datosClase = async (cliente_id, body, actual = null) => {
  const nombre = body.nombre !== undefined ? texto(body.nombre, { min: 2, max: 80 }) : actual?.nombre;
  if (!nombre) throw new EduError('Nombre inválido', { field: 'nombre' });
  const tipo_clase_id = body.tipo_clase_id !== undefined ? Number(body.tipo_clase_id) : actual?.tipo_clase_id;
  const tipo = Number.isInteger(tipo_clase_id) ? await db.getTipo(cliente_id, tipo_clase_id) : null;
  if (!tipo) throw new EduError('Tipo de clase inválido', { field: 'tipo_clase_id' });
  if (!tipo.activo && tipo.id !== actual?.tipo_clase_id) {
    throw new EduError('El tipo de clase está inactivo', { field: 'tipo_clase_id' });
  }
  let cupo = body.cupo !== undefined ? body.cupo : actual?.cupo ?? null;
  if (cupo === '' || cupo === null) cupo = null;
  if (cupo !== null) {
    cupo = Number(cupo);
    if (!Number.isInteger(cupo) || cupo < 1 || cupo > 500) throw new EduError('Cupo inválido', { field: 'cupo' });
    if (!tipo.es_grupal) throw new EduError('El cupo sólo aplica a clases grupales (talleres)', { field: 'cupo' });
  }
  if (await db.clasePorNombre(cliente_id, nombre, tipo.id, actual?.id ?? null)) {
    throw new EduError('Ya existe esa clase para ese tipo', { status: 409, code: 'DUPLICADO', field: 'nombre' });
  }
  return { nombre, tipo_clase_id: tipo.id, cupo, tipo };
};

const crearClase = async (cliente_id, body = {}) => {
  const d = await datosClase(cliente_id, body);
  const { id } = await db.crearClase(cliente_id, d);
  // Precio inicial opcional en el mismo alta
  if (body.precio) await crearPrecio(cliente_id, id, body.precio);
  return getClase(cliente_id, id);
};

const actualizarClase = async (cliente_id, id, body = {}) => {
  const actual = await db.getClase(cliente_id, id, hoy());
  if (!actual) throw NO_ENCONTRADA('Clase');
  const d = await datosClase(cliente_id, body, actual);
  if (d.tipo.es_grupal !== actual.es_grupal && actual.inscripciones_activas > 0) {
    throw new EduError('No se puede pasar de individual a taller (o al revés) con inscripciones activas', {
      status: 409, code: 'EN_USO', field: 'tipo_clase_id',
    });
  }
  const activa = typeof body.activa === 'boolean' ? body.activa : actual.activa;
  if (!activa && actual.activa && actual.inscripciones_activas > 0) {
    throw new EduError('La clase tiene inscripciones activas', { status: 409, code: 'TIENE_INSCRIPCIONES' });
  }
  await db.actualizarClase(cliente_id, id, { ...d, activa });
  return getClase(cliente_id, id);
};

/** Baja lógica: la clase queda inactiva y no admite inscripciones nuevas. */
const desactivarClase = (cliente_id, id) => actualizarClase(cliente_id, id, { activa: false });

// ─── Precios ────────────────────────────────────────────────────────────────
const claseExistente = async (cliente_id, clase_id) => {
  const clase = await db.getClase(cliente_id, clase_id, hoy());
  if (!clase) throw NO_ENCONTRADA('Clase');
  return clase;
};

const listarPrecios = async (cliente_id, clase_id) => {
  await claseExistente(cliente_id, clase_id);
  return db.listarPrecios(cliente_id, clase_id);
};

const crearPrecio = async (cliente_id, clase_id, body = {}) => {
  await claseExistente(cliente_id, clase_id);
  const vigente_desde = normalizarPeriodo(body.vigente_desde);
  if (!vigente_desde) throw new EduError('Mes inválido: usá AAAA-MM', { field: 'vigente_desde' });
  const importe_mensual = importe(body.importe_mensual, 'importe_mensual');
  const importe_clase = importe(body.importe_clase, 'importe_clase', { requerido: false });
  if (await db.precioDelMes(cliente_id, clase_id, vigente_desde)) {
    throw new EduError('Ya hay un precio cargado para ese mes: editalo', { status: 409, code: 'PRECIO_DUPLICADO', field: 'vigente_desde' });
  }
  return db.crearPrecio(cliente_id, clase_id, { vigente_desde, importe_mensual, importe_clase });
};

const actualizarPrecio = async (cliente_id, clase_id, id, body = {}) => {
  const actual = await db.getPrecio(cliente_id, clase_id, id);
  if (!actual) throw NO_ENCONTRADA('Precio');
  const importe_mensual = body.importe_mensual !== undefined
    ? importe(body.importe_mensual, 'importe_mensual') : Number(actual.importe_mensual);
  const importe_clase = body.importe_clase !== undefined
    ? importe(body.importe_clase, 'importe_clase', { requerido: false })
    : (actual.importe_clase === null ? null : Number(actual.importe_clase));
  return db.actualizarPrecio(cliente_id, clase_id, id, { importe_mensual, importe_clase });
};

const borrarPrecio = async (cliente_id, clase_id, id) => {
  const r = await db.borrarPrecio(cliente_id, clase_id, id);
  if (!r) throw NO_ENCONTRADA('Precio');
  return r;
};

/** Precio de una clase para un mes (AAAA-MM). Sin precio previo → 404 SIN_PRECIO. */
const precioVigente = async (cliente_id, clase_id, periodo) => {
  await claseExistente(cliente_id, clase_id);
  const p = normalizarPeriodo(periodo ?? hoy());
  if (!p) throw new EduError('Período inválido: usá AAAA-MM', { field: 'periodo' });
  const vigente = resolverPrecioVigente(await db.listarPrecios(cliente_id, clase_id), p);
  if (!vigente) {
    throw new EduError('La clase no tiene precio cargado para ese mes', { status: 404, code: 'SIN_PRECIO' });
  }
  const { desde: _desde, ...precio } = vigente;
  return { periodo: p.slice(0, 7), ...precio };
};

module.exports = {
  listarTipos, crearTipo, actualizarTipo,
  listarClases, getClase, crearClase, actualizarClase, desactivarClase,
  listarPrecios, crearPrecio, actualizarPrecio, borrarPrecio, precioVigente,
};
