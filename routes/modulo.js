const express = require('express');
const router = express.Router();
const { registerTenantGuards } = require('../middleware/tenantMiddleware');
registerTenantGuards(router);
const {
  createModulo,
  getModuloById,
  getModuloList,
  updateModulo,
  deleteModulo,
  getPermisosByModuloId
} = require('../controllers/moduloController');

const { soloAdmin } = require('../middleware/acceso');

// Configuración de módulos, roles y permisos: sólo el admin. Antes no había
// guard y un empleado podía sumarse permisos (o módulos) a su propio rol.
// La pantalla de Roles guarda por POST /api/rol/:id/:cliente_id/modulos-permisos.

router.post('/', soloAdmin, createModulo);
router.get('/list/:cliente_id', getModuloList);
router.get('/:id/:cliente_id', getModuloById);
router.put('/:id', soloAdmin, updateModulo);
router.delete('/:id/:cliente_id', soloAdmin, deleteModulo);
router.get('/:cliente_id/:id_modulo/permisos', getPermisosByModuloId);

module.exports = router;
