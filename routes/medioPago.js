const express = require('express');
const router = express.Router();
const { enforceParamTenant } = require('../middleware/tenantMiddleware');
router.use(enforceParamTenant);
const {
  createMedioPago,
  getMedioPagoById,
  getMedioPagoList,
  updateMedioPago,
  deleteMedioPago,
} = require('../controllers/medioPagoController');

router.post('/', createMedioPago);
router.get('/list', getMedioPagoList);
router.get('/:id', getMedioPagoById);
router.put('/:id', updateMedioPago);
router.delete('/:id', deleteMedioPago);

module.exports = router;
