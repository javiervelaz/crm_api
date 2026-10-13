// routes/edu.js — /api/edu (rubro educación, módulo "alumnos").
//
// Llega después de authenticateJWT, scopeTenant, los guards de cuenta y
// withTenantConnection (node.js). Dos grupos:
// - Administración: staff con el módulo alumnos y el permiso de la acción.
// - /mis/*: profesor, tutor o alumno, filtrado a lo propio.
const express = require('express');
const { authorizeModule } = require('../middleware/moduleAuth');
const { authorizePermission } = require('../middleware/permissionMiddleware');
const { registerTenantGuards } = require('../middleware/tenantMiddleware');
const { requireModuloTenant, soloStaff, cargarPersonaEdu } = require('../middleware/eduAcceso');
const c = require('../controllers/eduController');

const router = express.Router();
registerTenantGuards(router);
router.use(requireModuloTenant('alumnos'));

// ─── Vista propia (antes que las rutas de admin) ──────────────────────────
router.get('/mis/perfil', cargarPersonaEdu, c.miPerfil);
router.get('/mis/inscripciones', cargarPersonaEdu, c.misInscripciones);
router.get('/mis/inscripciones/:id', cargarPersonaEdu, c.miInscripcion);
router.get('/mis/agenda', cargarPersonaEdu, c.miAgenda);

// ─── Administración ───────────────────────────────────────────────────────
const admin = (accion) => [
  soloStaff,
  authorizeModule('alumnos'),
  authorizePermission('alumnos', `alumnos.${accion}`),
];
const LIST = admin('list');
const CREATE = admin('create');
const UPDATE = admin('update');
const DELETE = admin('delete');

router.get('/tipos-clase', LIST, c.listarTipos);
router.post('/tipos-clase', CREATE, c.crearTipo);
router.put('/tipos-clase/:id', UPDATE, c.actualizarTipo);

router.get('/clases', LIST, c.listarClases);
router.get('/clases/:id', LIST, c.getClase);
router.post('/clases', CREATE, c.crearClase);
router.put('/clases/:id', UPDATE, c.actualizarClase);
router.delete('/clases/:id', DELETE, c.desactivarClase);
router.get('/clases/:id/precio-vigente', LIST, c.precioVigente);
router.get('/clases/:id/precios', LIST, c.listarPrecios);
router.post('/clases/:id/precios', CREATE, c.crearPrecio);
router.put('/clases/:id/precios/:precioId', UPDATE, c.actualizarPrecio);
router.delete('/clases/:id/precios/:precioId', DELETE, c.borrarPrecio);

for (const [path, ctrl] of [['profesores', c.profesor], ['tutores', c.tutor], ['alumnos', c.alumno]]) {
  router.get(`/${path}`, LIST, ctrl.listar);
  router.get(`/${path}/:id`, LIST, ctrl.get);
  router.post(`/${path}`, CREATE, ctrl.crear);
  router.put(`/${path}/:id`, UPDATE, ctrl.actualizar);
  router.delete(`/${path}/:id`, DELETE, ctrl.desactivar);
  router.post(`/${path}/:id/acceso`, CREATE, ctrl.crearAcceso);
}

router.get('/inscripciones', LIST, c.listarInscripciones);
router.get('/inscripciones/:id', LIST, c.getInscripcion);
router.post('/inscripciones', CREATE, c.crearInscripcion);
router.put('/inscripciones/:id', UPDATE, c.actualizarInscripcion);
router.post('/inscripciones/:id/baja', UPDATE, c.bajaInscripcion);
router.put('/inscripciones/:id/horarios', UPDATE, c.horariosInscripcion);

router.get('/agenda', LIST, c.agenda);

module.exports = router;
