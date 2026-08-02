// routes/registroDiario.js
const express = require('express');
const router = express.Router();
const { enforceParamTenant } = require('../middleware/tenantMiddleware');
router.use(enforceParamTenant);
const { authenticateJWT } = require('../middleware/authMiddleware');
const { testConnection,getRegistrosDiarios, createRegistroDiario, updateRegistroDiario, deleteRegistroDiario,reporteOperacionesDiarias } = require('../controllers/registroDiarioController');

router.get('/:cliente_id', authenticateJWT, getRegistrosDiarios);
router.post('/', authenticateJWT, createRegistroDiario);
router.put('/:id', authenticateJWT, updateRegistroDiario);
router.delete('/:id/:cliente_id', authenticateJWT, deleteRegistroDiario);
router.get('/test', authenticateJWT, testConnection);

module.exports = router;
