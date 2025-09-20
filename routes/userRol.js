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
router.get('/list', getUserRolList);
router.get('/:id', getUserRolById);
router.put('/:id', updateUserRol);
router.delete('/:id', deleteUserRol);
router.get('/user/:id', getUserRoleByUserId);

module.exports = router;
