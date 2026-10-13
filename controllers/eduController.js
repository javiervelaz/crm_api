// controllers/eduController.js — /api/edu. El tenant sale siempre del JWT.
const catalogo = require('../services/edu/catalogoService');
const personas = require('../services/edu/personasService');
const inscripciones = require('../services/edu/inscripcionService');
const { EduError } = require('../services/edu/reglas');
const { CuentaError } = require('../services/cuenta/cuentaService');

const responderError = (res, next, err) => {
  if (err instanceof EduError || err instanceof CuentaError) {
    return res.status(err.status).json({
      error: err.message, code: err.code, field: err.field, ...(err.detalle ? { detalle: err.detalle } : {}),
    });
  }
  // Carreras contra los UNIQUE de la base (dos altas iguales a la vez)
  if (err?.code === '23505') return res.status(409).json({ error: 'El registro ya existe', code: 'DUPLICADO' });
  return next(err);
};

/** Envuelve un handler: (req) => resultado; status 200 o el indicado. */
const h = (fn, status = 200) => async (req, res, next) => {
  try {
    res.status(status).json(await fn(req));
  } catch (err) {
    responderError(res, next, err);
  }
};

const cid = (req) => req.clienteId;
const id = (req) => Number(req.params.id);
const precioId = (req) => {
  const n = Number(req.params.precioId);
  if (!Number.isInteger(n) || n <= 0) throw new EduError('precioId inválido', { code: 'INVALID_PARAM' });
  return n;
};

// Tipos de clase
const listarTipos = h((req) => catalogo.listarTipos(cid(req)));
const crearTipo = h((req) => catalogo.crearTipo(cid(req), req.body), 201);
const actualizarTipo = h((req) => catalogo.actualizarTipo(cid(req), id(req), req.body));

// Clases y precios
const listarClases = h((req) => catalogo.listarClases(cid(req), { activas: req.query.activas === 'true' }));
const getClase = h((req) => catalogo.getClase(cid(req), id(req)));
const crearClase = h((req) => catalogo.crearClase(cid(req), req.body), 201);
const actualizarClase = h((req) => catalogo.actualizarClase(cid(req), id(req), req.body));
const desactivarClase = h((req) => catalogo.desactivarClase(cid(req), id(req)));
const listarPrecios = h((req) => catalogo.listarPrecios(cid(req), id(req)));
const crearPrecio = h((req) => catalogo.crearPrecio(cid(req), id(req), req.body), 201);
const actualizarPrecio = h((req) => catalogo.actualizarPrecio(cid(req), id(req), precioId(req), req.body));
const borrarPrecio = h((req) => catalogo.borrarPrecio(cid(req), id(req), precioId(req)));
const precioVigente = h((req) => catalogo.precioVigente(cid(req), id(req), req.query.periodo));

// Personas: profesor | tutor | alumno
const personaHandlers = (entidad) => ({
  listar: h((req) => personas.listar(entidad, cid(req), req.query)),
  get: h((req) => personas.get(entidad, cid(req), id(req))),
  crear: h((req) => personas.crear(entidad, cid(req), req.body), 201),
  actualizar: h((req) => personas.actualizar(entidad, cid(req), id(req), req.body)),
  desactivar: h((req) => personas.desactivar(entidad, cid(req), id(req))),
  crearAcceso: h((req) => personas.crearAcceso(entidad, cid(req), id(req), req.body), 201),
});

// Inscripciones
const listarInscripciones = h((req) => inscripciones.listar(cid(req), req.query));
const getInscripcion = h((req) => inscripciones.get(cid(req), id(req)));
const crearInscripcion = h((req) => inscripciones.crear(cid(req), req.body), 201);
const actualizarInscripcion = h((req) => inscripciones.actualizar(cid(req), id(req), req.body));
const bajaInscripcion = h((req) => inscripciones.darDeBaja(cid(req), id(req), req.body));
const horariosInscripcion = h((req) => inscripciones.actualizarHorarios(cid(req), id(req), req.body));
const agenda = h((req) => inscripciones.agenda(cid(req), req.query));

// Vista propia (profesor, tutor, alumno): todo filtrado por req.eduAlcance
const miPerfil = h((req) => personas.get(req.eduPersona.entidad, cid(req), req.eduPersona.id));
const misInscripciones = h((req) => inscripciones.listarPropias(cid(req), req.query, req.eduAlcance));
const miInscripcion = h((req) => inscripciones.get(cid(req), id(req), req.eduAlcance));
const miAgenda = h((req) => inscripciones.agenda(cid(req), req.query, req.eduAlcance));

module.exports = {
  listarTipos, crearTipo, actualizarTipo,
  listarClases, getClase, crearClase, actualizarClase, desactivarClase,
  listarPrecios, crearPrecio, actualizarPrecio, borrarPrecio, precioVigente,
  profesor: personaHandlers('profesor'),
  tutor: personaHandlers('tutor'),
  alumno: personaHandlers('alumno'),
  listarInscripciones, getInscripcion, crearInscripcion, actualizarInscripcion, bajaInscripcion, horariosInscripcion, agenda,
  miPerfil, misInscripciones, miInscripcion, miAgenda,
};
