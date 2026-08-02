// routes/cliente.js — el tenant sólo puede leer y editar su propia ficha
const express = require('express');
const router = express.Router();
const { authorizeRole } = require('../middleware/authMiddleware');
const { getClienteById, updateCliente } = require('../controllers/clienteController');

// GET /api/cliente/me
router.get('/me', async (req, res, next) => {
  req.params.id = String(req.clienteId);
  return getClienteById(req, res, next);
});

router.put('/me', authorizeRole(['admin']), async (req, res, next) => {
  req.params.id = String(req.clienteId);
  return updateCliente(req, res, next);
});

// createCliente vive en /api/saas (alta pública)
// deleteCliente y el listado global viven en /api/platform
module.exports = router;