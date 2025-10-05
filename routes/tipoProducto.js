const express = require('express');
const router = express.Router();
const {
  createTipoProducto,
  getTipoProductoById,
  getTipoProductoList,
  updateTipoProducto,
  deleteTipoProducto,
} = require('../controllers/tipoProductoController');

router.post('/', createTipoProducto);
router.get('/list/:cliente_id', getTipoProductoList);
router.get('/:id', getTipoProductoById);
router.put('/:id', updateTipoProducto);
router.delete('/:id', deleteTipoProducto);

module.exports = router;
