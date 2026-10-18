// middleware/eduAcceso.js
//
// Acceso a /api/edu:
// - requireModuloTenant: el comercio tiene el módulo activo (vale para staff y
//   externos; los roles de profesor/tutor/alumno no tienen módulos en el JWT).
// - soloStaff: rutas de administración, nunca para externos.
// - cargarPersonaEdu: para profesor/tutor/alumno resuelve su ficha (edu_*) a
//   partir del usuario y arma el alcance con el que se filtran sus consultas.
const catalogoDb = require('../model/edu/catalogo');
const personasDb = require('../model/edu/personas');
const { esExterno } = require('./cuentaGuards');

const ENTIDAD_POR_TIPO = { PROF: 'profesor', TUT: 'tutor', ALU: 'alumno' };

const requireModuloTenant = (codigo) => async (req, res, next) => {
  try {
    if (await catalogoDb.tenantTieneModulo(req.clienteId, codigo)) return next();
    return res.status(403).json({ error: 'Tu comercio no tiene este módulo', code: 'MODULO_INACTIVO' });
  } catch (err) {
    return next(err);
  }
};

const soloStaff = (req, res, next) => (esExterno(req.user)
  ? res.status(403).json({ error: 'Tu usuario no tiene acceso a esta sección.', code: 'ROL_SIN_ACCESO' })
  : next());

const cargarPersonaEdu = async (req, res, next) => {
  try {
    const entidad = ENTIDAD_POR_TIPO[req.user?.tipo];
    if (!entidad) {
      return res.status(403).json({ error: 'Esta sección es para profesores, tutores y alumnos', code: 'ROL_SIN_ACCESO' });
    }
    const persona = await personasDb.porUserId(entidad, req.clienteId, req.user.userId);
    if (!persona || !persona.activo) {
      return res.status(403).json({ error: 'Tu usuario no está vinculado a una ficha activa de la academia', code: 'SIN_FICHA' });
    }
    req.eduPersona = { entidad, id: persona.id };
    req.eduAlcance = { [`${entidad}_id`]: persona.id };
    return next();
  } catch (err) {
    return next(err);
  }
};

module.exports = { requireModuloTenant, soloStaff, cargarPersonaEdu, ENTIDAD_POR_TIPO };
