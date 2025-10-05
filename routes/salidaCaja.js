const express = require('express');
const router = express.Router();
const {
  createSalidaCaja,
  getSalidaCajaById,
  getSalidaCajaList,
  updateSalidaCaja,
  deleteSalidaCaja,
  getMontoGastos
} = require('../controllers/salidaCajaController');

router.post('/', createSalidaCaja);
router.get('/list/:id/:cliente_id', getSalidaCajaList);
router.get('/:id/:cliente_id', getSalidaCajaById);
router.put('/:id', updateSalidaCaja);
router.delete('/:id/:cliente_id', deleteSalidaCaja);
router.post('/monto-gastos/:id', getMontoGastos);

module.exports = router;
