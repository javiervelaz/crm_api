const express = require('express');
const router = express.Router();
const { registerTenantGuards } = require('../middleware/tenantMiddleware');
registerTenantGuards(router);
const {
  createPermiso,
  getPermisoById,
  getPermisoList,
  updatePermiso,
  deletePermiso,
  getPermisoByUserId
} = require('../controllers/permisoController');

const { soloAdmin } = require('../middleware/acceso');

// Configuración de módulos, roles y permisos: sólo el admin. Antes no había
// guard y un empleado podía sumarse permisos (o módulos) a su propio rol.
// La pantalla de Roles guarda por POST /api/rol/:id/:cliente_id/modulos-permisos.

router.post('/', soloAdmin, createPermiso);
router.get('/list/:cliente_id', getPermisoList);
router.get('/:id/:cliente_id', getPermisoById);
router.put('/:id', soloAdmin, updatePermiso);
router.delete('/:id/:cliente_id', soloAdmin, deletePermiso);
router.get('/user/:user_id/:cliente_id', getPermisoByUserId);

module.exports = router;
