const express = require('express');
const router = express.Router();
const {
    createUserRol,
    getUserRolById,
    getUserRolList,
    updateUserRol,
    deleteUserRol,
    getUserRoleByUserId
} = require('../controllers/userRolController');

router.post('/', createUserRol);
router.get('/list/:cliente_id', getUserRolList);
router.get('/:id/:cliente_id', getUserRolById);
router.put('/:id', updateUserRol);
router.delete('/:id/:cliente_id', deleteUserRol);
router.get('/user/:id/:cliente_id', getUserRoleByUserId);

module.exports = router;
