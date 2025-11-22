const express = require('express');
const { authorizeModule } = require('../middleware/moduleAuth');
const { authenticateJWT, authorizeRole } = require('../middleware/authMiddleware');
const { authorizePermission } = require("../middleware/permissionMiddleware");

const router = express.Router();
const {
  createTipoProducto,
  getTipoProductoById,
  getTipoProductoList,
  updateTipoProducto,
  deleteTipoProducto,
} = require('../controllers/tipoProductoController');

router.post('/',authenticateJWT,authorizeModule('productos'),authorizePermission('productos', 'productos.create'), createTipoProducto);
router.get('/list/:cliente_id', getTipoProductoList);
router.get('/:id', getTipoProductoById);
router.put('/:id', updateTipoProducto);
router.delete('/:id', deleteTipoProducto);

module.exports = router;
