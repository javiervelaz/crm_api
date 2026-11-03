const express = require('express');
const router = express.Router();
const { registerTenantGuards } = require('../middleware/tenantMiddleware');
registerTenantGuards(router);
const {
  getCategoriaTipoById,
  getCategoriaTipoList,
} = require('../controllers/categoriaTipoController');

// categoria_tipo (fijo / variable / sueldos) es un catálogo GLOBAL: lo usan
// todos los comercios, los reportes y la FK de salida_caja (021). Antes
// cualquier usuario logueado podía crear, renombrar o borrar filas y le
// rompía los gastos a todos. Las escrituras se sacaron; si hiciera falta
// cargarlo, va por migración o /api/platform.
router.get('/list', getCategoriaTipoList);
router.get('/:id', getCategoriaTipoById);

module.exports = router;
