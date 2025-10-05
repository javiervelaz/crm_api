const express = require('express');
const router = express.Router();
const {
getVentasFiltersController,
getGastosPorTipoFiltersController,
getGastosPorCategoriaSalidaFiltersController,
getCategoriaSalidaController,
getCategoriaTipoController,
getClientesFiltersController
} = require('../controllers/reportesContoller');

router.post('/ventas', getVentasFiltersController);
router.post("/gastos/tipo-categoria-filter",getGastosPorTipoFiltersController)
router.post("/gastos/categoria-salida-filter",getGastosPorCategoriaSalidaFiltersController)
router.get("/salida/categoria-salida/:cliente_id",getCategoriaSalidaController)
router.get("/salida/categoria-tipo",getCategoriaTipoController)
router.post('/clientes', getClientesFiltersController);

module.exports = router;
