// routes/registroDiario.js
const express = require('express');
const router = express.Router();
const { registerTenantGuards } = require('../middleware/tenantMiddleware');
registerTenantGuards(router);
const { authenticateJWT } = require('../middleware/authMiddleware');
const { soloAdmin } = require('../middleware/acceso');

// ABM directo de registros de caja (montos inicial/final). El front no lo usa:
// la caja se abre y cierra por /api/operaciones. Queda para el admin.
router.use(soloAdmin);
const { testConnection,getRegistrosDiarios, createRegistroDiario, updateRegistroDiario, deleteRegistroDiario,reporteOperacionesDiarias } = require('../controllers/registroDiarioController');

router.get('/:cliente_id', authenticateJWT, getRegistrosDiarios);
router.post('/', authenticateJWT, createRegistroDiario);
router.put('/:id', authenticateJWT, updateRegistroDiario);
router.delete('/:id/:cliente_id', authenticateJWT, deleteRegistroDiario);
router.get('/test', authenticateJWT, testConnection);

module.exports = router;
