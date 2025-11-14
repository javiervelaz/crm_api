// routes/registroDiario.js
const express = require('express');
const router = express.Router();
const { testConnection,getRegistrosDiarios, createRegistroDiario, updateRegistroDiario, deleteRegistroDiario,reporteOperacionesDiarias } = require('../controllers/registroDiarioController');

router.get('/:cliente_id', getRegistrosDiarios);
router.post('/', createRegistroDiario);
router.put('/:id', updateRegistroDiario);
router.delete('/:id/:cliente_id', deleteRegistroDiario);
router.get('/test', testConnection);

module.exports = router;
