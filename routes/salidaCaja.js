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
  getMontoGastos
} = require('../controllers/salidaCajaController');

router.get('/config', getGastosConfig);       // { requiereCaja }
router.get('/periodo', getGastosPorPeriodo);  // ?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
router.post('/', createSalidaCaja);
router.get('/list/:id/:cliente_id', getSalidaCajaList);
router.get('/:id/:cliente_id', getSalidaCajaById);
router.put('/:id', updateSalidaCaja);
router.delete('/:id/:cliente_id', deleteSalidaCaja);
router.post('/monto-gastos/:id', getMontoGastos);

module.exports = router;
