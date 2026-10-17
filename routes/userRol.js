const express = require('express');
const router = express.Router();
const { registerTenantGuards } = require('../middleware/tenantMiddleware');
registerTenantGuards(router);
const {
    createUserRol,
    getUserRolById,
    getUserRolList,
    updateUserRol,
    deleteUserRol,
    getUserRoleByUserId
} = require('../controllers/userRolController');
const { authorizeRole } = require('../middleware/authMiddleware');

// Asignar o quitar roles es de admin: antes cualquier usuario del staff podía
// darse el rol admin a sí mismo.
const soloAdmin = authorizeRole(['admin']);

router.post('/', soloAdmin, createUserRol);
router.get('/list/:cliente_id', getUserRolList);
router.get('/:id/:cliente_id', getUserRolById);
router.put('/:id', soloAdmin, updateUserRol);
router.delete('/:id/:cliente_id', soloAdmin, deleteUserRol);
router.get('/user/:id/:cliente_id', getUserRoleByUserId);

module.exports = router;
