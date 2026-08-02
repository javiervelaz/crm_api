const express = require('express');
const router = express.Router();
const { enforceParamTenant } = require('../middleware/tenantMiddleware');
router.use(enforceParamTenant);
const {
  createCategoria,
  getCategoriaById,
  getCategoriaList,
  updateCategoria,
  deleteCategoria,
} = require('../controllers/categoriaSalidaController');

router.post('/', createCategoria);
router.get('/list/:cliente_id', getCategoriaList);
router.get('/:id/:cliente_id', getCategoriaById);
router.put('/:id', updateCategoria);
router.delete('/:id/:cliente_id', deleteCategoria);

module.exports = router;
