const express = require('express');
const router = express.Router();
const { registerTenantGuards } = require('../middleware/tenantMiddleware');
registerTenantGuards(router);
const {
    createModuloRol,
    getModuloRolById,
    getModuloRolList,
    updateModuloRol,
    deleteModuloRol,
    getUserRolModuloByUserId
} = require('../controllers/moduloRolController');

const { soloAdmin } = require('../middleware/acceso');

// Configuración de módulos, roles y permisos: sólo el admin. Antes no había
// guard y un empleado podía sumarse permisos (o módulos) a su propio rol.
// La pantalla de Roles guarda por POST /api/rol/:id/:cliente_id/modulos-permisos.

router.post('/', soloAdmin, createModuloRol);
router.get('/list/:cliente_id', getModuloRolList);
router.get('/:id/:cliente_id', getModuloRolById);
router.put('/:id/', soloAdmin, updateModuloRol);
router.delete('/:id/:cliente_id', soloAdmin, deleteModuloRol);
router.get("/:user_id/:cliente_id",getUserRolModuloByUserId)

module.exports = router;
