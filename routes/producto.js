const express = require('express');
const { authorizeModule } = require('../middleware/moduleAuth');

const router = express.Router();
const {
  createProducto,
  getProductoById,
  getProductoList,
  updateProducto,
  deleteProducto,
} = require('../controllers/productoController');

router.post('/', authorizeModule('productos'),createProducto);
router.get('/list/:cliente_id', getProductoList);
router.get('/:id/:cliente_id', getProductoById);
router.put('/:id', updateProducto);
router.delete('/:id/:cliente_id', deleteProducto);

module.exports = router;
