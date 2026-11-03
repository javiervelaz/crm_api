const express = require('express');
const router = express.Router();
const { registerTenantGuards } = require('../middleware/tenantMiddleware');
registerTenantGuards(router);
const {
  getGastosConfig,
  getGastosPorPeriodo,
  createSalidaCaja,
  getSalidaCajaById,
  getSalidaCajaList,
  updateSalidaCaja,
  deleteSalidaCaja,
  getMontoGastos,
  getMontoGastosEfectivo
} = require('../controllers/salidaCajaController');
const { requierePermiso } = require('../middleware/acceso');

// Gastos. Antes ninguna ruta pedía módulo ni permiso: cualquier usuario del
// staff cargaba, editaba o borraba gastos. Los montos del día los usa también
// Cierre de caja.
const VER = requierePermiso('gasto.list', 'flujo.list', 'cerrarcaja.list');

router.get('/config', getGastosConfig);       // { requiereCaja } — también la usa Inventario: sólo staff
router.get('/periodo', requierePermiso('gasto.list', 'flujo.list'), getGastosPorPeriodo);  // ?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
router.get('/efectivo/:id', VER, getMontoGastosEfectivo); // gastos en efectivo de una caja
router.post('/', requierePermiso('gasto.create', 'flujo.create'), createSalidaCaja);
router.get('/list/:id/:cliente_id', VER, getSalidaCajaList);
router.get('/:id/:cliente_id', VER, getSalidaCajaById);
router.put('/:id', requierePermiso('gasto.update', 'flujo.update'), updateSalidaCaja);
router.delete('/:id/:cliente_id', requierePermiso('gasto.delete', 'flujo.delete'), deleteSalidaCaja);
router.post('/monto-gastos/:id', VER, getMontoGastos);

module.exports = router;
