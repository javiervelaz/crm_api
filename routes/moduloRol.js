const express = require('express');
const router = express.Router();
const {
    createModuloRol,
    getModuloRolById,
    getModuloRolList,
    updateModuloRol,
    deleteModuloRol,
    getUserRolModuloByUserId
} = require('../controllers/moduloRolController');

router.post('/', createModuloRol);
router.get("/:user_id/:cliente_id",getUserRolModuloByUserId)
router.get('/list/:cliente_id', getModuloRolList);
router.get('/:id/:cliente_id', getModuloRolById);
router.put('/:id/', updateModuloRol);
router.delete('/:id/:cliente_id', deleteModuloRol);

module.exports = router;
