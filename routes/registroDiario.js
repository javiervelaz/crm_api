// routes/registroDiario.js
const express = require('express');
const router = express.Router();
const { testConnection,getRegistrosDiarios, createRegistroDiario, updateRegistroDiario, deleteRegistroDiario,reporteOperacionesDiarias } = require('../controllers/registroDiarioController');

router.get('/', getRegistrosDiarios);
router.post('/', createRegistroDiario);
router.put('/:id', updateRegistroDiario);
router.delete('/:id', deleteRegistroDiario);
router.get('/test', testConnection);

module.exports = router;
