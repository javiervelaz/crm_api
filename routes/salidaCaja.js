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
router.get('/list', getSalidaCajaList);
router.get('/:id', getSalidaCajaById);
router.put('/:id', updateSalidaCaja);
router.delete('/:id', deleteSalidaCaja);
router.post('/monto-gastos/:id', getMontoGastos);

module.exports = router;
