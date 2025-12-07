const express = require('express');
const router = express.Router();
const { authenticateJWT } = require('../middleware/authMiddleware');
const { requireFeature } = require('../middleware/featureMiddleware');
const {
getVentasFiltersController,
getGastosPorTipoFiltersController,
getGastosPorCategoriaSalidaFiltersController,
getCategoriaSalidaController,
getCategoriaTipoController,
getClientesFiltersController
} = require('../controllers/reportesContoller');

// TODOS LOS REPORTES → requieren login + feature canUseReports
router.post('/ventas',
  authenticateJWT,
  requireFeature('canUseReports'),
  getVentasFiltersController
);

router.post('/gastos/tipo-categoria-filter',
  authenticateJWT,
  requireFeature('canUseReports'),
  getGastosPorTipoFiltersController
);

router.post('/gastos/categoria-salida-filter',
  authenticateJWT,
  requireFeature('canUseReports'),
  getGastosPorCategoriaSalidaFiltersController
);

router.get('/salida/categoria-salida/:cliente_id',
  authenticateJWT,
  requireFeature('canUseReports'),
  getCategoriaSalidaController
);

router.get('/salida/categoria-tipo',
  authenticateJWT,
  requireFeature('canUseReports'),
  getCategoriaTipoController
);

router.post('/clientes',
  authenticateJWT,
  requireFeature('canUseReports'),
  getClientesFiltersController
);


module.exports = router;
