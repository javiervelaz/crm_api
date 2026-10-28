const express = require('express');
const router = express.Router();
const { registerTenantGuards } = require('../middleware/tenantMiddleware');
registerTenantGuards(router);
const { authenticateJWT } = require('../middleware/authMiddleware');
const { requireFeature } = require('../middleware/featureMiddleware');
const { authorizeModule } = require('../middleware/moduleAuth');
const { authorizePermission } = require('../middleware/permissionMiddleware');
const {
getVentasFiltersController,
getGastosPorTipoFiltersController,
getGastosPorCategoriaSalidaFiltersController,
getCategoriaSalidaController,
getCategoriaTipoController,
getClientesFiltersController
} = require('../controllers/reportesContoller');

// TODOS LOS REPORTES → login + feature canUseReports + módulo y permiso reportes.list
// (antes solo login+feature: cualquier usuario logueado leía ventas/gastos por API).
const soloReportes = [authorizeModule('reportes'), authorizePermission('reportes', 'reportes.list')];
router.post('/ventas',
  authenticateJWT,
  requireFeature('canUseReports'),
  ...soloReportes,
  getVentasFiltersController
);

router.post('/gastos/tipo-categoria-filter',
  authenticateJWT,
  requireFeature('canUseReports'),
  ...soloReportes,
  getGastosPorTipoFiltersController
);

router.post('/gastos/categoria-salida-filter',
  authenticateJWT,
  requireFeature('canUseReports'),
  ...soloReportes,
  getGastosPorCategoriaSalidaFiltersController
);

router.get('/salida/categoria-salida/:cliente_id',
  authenticateJWT,
  requireFeature('canUseReports'),
  ...soloReportes,
  getCategoriaSalidaController
);

router.get('/salida/categoria-tipo',
  authenticateJWT,
  requireFeature('canUseReports'),
  ...soloReportes,
  getCategoriaTipoController
);

router.post('/clientes',
  authenticateJWT,
  requireFeature('canUseReports'),
  ...soloReportes,
  getClientesFiltersController
);


module.exports = router;
