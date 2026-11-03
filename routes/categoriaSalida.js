const express = require('express');
const router = express.Router();
const { registerTenantGuards } = require('../middleware/tenantMiddleware');
registerTenantGuards(router);
const {
  createCategoria,
  getCategoriaById,
  getCategoriaList,
  updateCategoria,
  deleteCategoria,
} = require('../controllers/categoriaSalidaController');
const { requierePermiso } = require('../middleware/acceso');

// Categorías de gasto del comercio. Leerlas es de cualquiera que cargue gastos;
// crearlas, editarlas o borrarlas, de quien tenga ese permiso en Gastos.

router.post('/', requierePermiso('gasto.create'), createCategoria);
router.get('/list/:cliente_id', getCategoriaList);
router.get('/:id/:cliente_id', getCategoriaById);
router.put('/:id', requierePermiso('gasto.update'), updateCategoria);
router.delete('/:id/:cliente_id', requierePermiso('gasto.delete'), deleteCategoria);

module.exports = router;
