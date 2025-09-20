const express = require('express');
const router = express.Router();
const {
  createProducto,
  getProductoById,
  getProductoList,
  updateProducto,
  deleteProducto,
} = require('../controllers/productoController');

router.post('/', createProducto);
router.get('/list', getProductoList);
router.get('/:id', getProductoById);
router.put('/:id', updateProducto);
router.delete('/:id', deleteProducto);

module.exports = router;
