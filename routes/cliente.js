const express = require('express');
const router = express.Router();
const {
  createCliente,
  getClienteById,
  getClienteList,
  updateCliente,
  deleteCliente,
} = require('../controllers/clienteController');

router.post('/', createCliente);
router.get('/list/', getClienteList);
router.get('/list/:id', getClienteById);
router.put('/:id', updateCliente);
router.delete('/:id', deleteCliente);

module.exports = router;