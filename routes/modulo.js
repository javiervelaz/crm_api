const express = require('express');
const router = express.Router();
const {
  createModulo,
  getModuloById,
  getModuloList,
  updateModulo,
  deleteModulo,
  getPermisosByModuloId
} = require('../controllers/moduloController');

router.post('/', createModulo);
router.get('/list/:cliente_id', getModuloList);
router.get('/:id/:cliente_id', getModuloById);
router.put('/:id', updateModulo);
router.delete('/:id/:cliente_id', deleteModulo);
router.get('/:cliente_id/:id_modulo/permisos', getPermisosByModuloId);

module.exports = router;
