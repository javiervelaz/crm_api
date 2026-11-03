const express = require('express');
const router = express.Router();
const { registerTenantGuards } = require('../middleware/tenantMiddleware');
registerTenantGuards(router);
const {
  createRolPermiso,
  getRolPermisoById,
  getRolPermisoList,
  updateRolPermiso,
  deleteRolPermiso,
} = require('../controllers/rolPermisoController');

const { soloAdmin } = require('../middleware/acceso');

// Configuración de módulos, roles y permisos: sólo el admin. Antes no había
// guard y un empleado podía sumarse permisos (o módulos) a su propio rol.
// La pantalla de Roles guarda por POST /api/rol/:id/:cliente_id/modulos-permisos.

router.post('/', soloAdmin, createRolPermiso);
router.get('/list/:cliente_id',getRolPermisoList );
router.get('/:id/:cliente_id', getRolPermisoById);
router.put('/:id', soloAdmin, updateRolPermiso);
router.delete('/:id/:cliente_id', soloAdmin, deleteRolPermiso);

module.exports = router;
