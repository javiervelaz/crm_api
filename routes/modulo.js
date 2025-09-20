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
router.get('/list', getModuloList);
router.get('/:id', getModuloById);
router.put('/:id', updateModulo);
router.delete('/:id', deleteModulo);

module.exports = router;
