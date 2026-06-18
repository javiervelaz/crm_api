const express = require('express');
const { authorizeModule } = require('../middleware/moduleAuth');
const { authorizePermission } = require("../middleware/permissionMiddleware");
const { authenticateJWT } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');
const { requireLimit } = require('../middleware/limitMiddleware');



const router = express.Router();
const {
  createProducto,
  getProductoById,
  getProductoList,
  updateProducto,
  deleteProducto,
  uploadImage,
  listImages,
  deleteImage
} = require('../controllers/productoController');

// Listar imágenes de un producto
router.get(
  '/:id/images',
  authenticateJWT,
  listImages,
);

// Borrar una imagen
router.delete(
  '/images/:imgId',
  authenticateJWT,
  authorizeModule('productos'),
  authorizePermission('productos', 'productos.update'),
  deleteImage,
);
router.post('/', authenticateJWT,authorizeModule('productos'),
authorizePermission('productos','productos.create'),requireLimit('maxProductos'),createProducto);
router.get('/list/:cliente_id',authenticateJWT,authorizeModule('productos'),authorizePermission('productos','productos.list'), getProductoList);
router.post('/list/:cliente_id', getProductoList);
router.get('/:id/:cliente_id', getProductoById);
router.put('/:id',authenticateJWT,authorizeModule('productos'),authorizePermission('productos','productos.update'), updateProducto);
router.delete('/:id/:cliente_id', authenticateJWT,authorizeModule('productos'),authorizePermission('productos','productos.delete'),deleteProducto);
// Subir imagen de producto
//whatsaap
router.get('/w/list/:cliente_id', getProductoList);
router.post(
  '/:id/images',
  upload.single('image'),          // campo "image" en el form-data
  uploadImage,
);




module.exports = router;
