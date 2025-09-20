const express = require('express');
const router = express.Router();
const {
  createCategoria,
  getCategoriaById,
  getCategoriaList,
  updateCategoria,
  deleteCategoria,
} = require('../controllers/categoriaSalidaController');

router.post('/', createCategoria);
router.get('/list', getCategoriaList);
router.get('/:id', getCategoriaById);
router.put('/:id', updateCategoria);
router.delete('/:id', deleteCategoria);

module.exports = router;
