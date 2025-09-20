const express = require('express');
const router = express.Router();
const {
    createModuloRol,
    getModuloRolById,
    getModuloRolList,
    updateModuloRol,
    deleteModuloRol,
} = require('../controllers/moduloRolController');

router.post('/', createModuloRol);
router.get('/list', getModuloRolList);
router.get('/:id', getModuloRolById);
router.put('/:id', updateModuloRol);
router.delete('/:id', deleteModuloRol);

module.exports = router;
