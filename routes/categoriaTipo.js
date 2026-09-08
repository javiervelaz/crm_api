const express = require('express');
const router = express.Router();
const { registerTenantGuards } = require('../middleware/tenantMiddleware');
registerTenantGuards(router);
const {
  createCategoriaTipo,
  getCategoriaTipoById,
  getCategoriaTipoList,
  updateCategoriaTipo,
  deleteCategoriaTipo,
} = require('../controllers/categoriaTipoController');

router.post('/', createCategoriaTipo);
router.get('/list', getCategoriaTipoList);
router.get('/:id', getCategoriaTipoById);
router.put('/:id', updateCategoriaTipo);
router.delete('/:id', deleteCategoriaTipo);

module.exports = router;
