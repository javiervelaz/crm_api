const express = require('express');
const router = express.Router();
const {
  createModulo,
  getModuloById,
  getModuloList,
  updateModulo,
  deleteModulo,
} = require('../controllers/moduloController');

router.post('/', createModulo);
router.get('/list/:cliente_id', getModuloList);
router.get('/:id/:cliente_id', getModuloById);
router.put('/:id', updateModulo);
router.delete('/:id/:cliente_id', deleteModulo);

module.exports = router;
