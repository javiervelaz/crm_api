const express = require('express');
const router = express.Router();
const { authenticateJWT, authorizeRole } = require('../middleware/authMiddleware');
const {
  createCliente,
  getClienteById,
  getClienteList,
  updateCliente,
  deleteCliente,
} = require('../controllers/clienteController');

router.post('/', authenticateJWT, authorizeRole(['admin']), createCliente);
router.get('/list/', authenticateJWT, getClienteList);
router.get('/list/:id', authenticateJWT, getClienteById);
router.put('/:id', authenticateJWT, authorizeRole(['admin']), updateCliente);
router.delete('/:id', authenticateJWT, authorizeRole(['admin']), deleteCliente);

module.exports = router;