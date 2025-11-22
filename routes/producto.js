const express = require('express');
const { authorizeModule } = require('../middleware/moduleAuth');
const { authorizePermission } = require("../middleware/permissionMiddleware");
const { authenticateJWT } = require('../middleware/authMiddleware');


const router = express.Router();
const {
  createProducto,
  getProductoById,
  getProductoList,
  updateProducto,
  deleteProducto,
} = require('../controllers/productoController');

router.post('/', authenticateJWT,authorizeModule('productos'),authorizePermission('productos','productos.create'),createProducto);
router.get('/list/:cliente_id', getProductoList);
router.get('/:id/:cliente_id', getProductoById);
router.put('/:id', updateProducto);
router.delete('/:id/:cliente_id', deleteProducto);

module.exports = router;
