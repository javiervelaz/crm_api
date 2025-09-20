const express = require('express');
const router = express.Router();
const {
  createEmpleado,
  getEmpleados,
  getEmpleadoById,
  updateEmpleado,
  deleteEmpleado,
} = require('../controllers/empleadoController');

router.post('/', createEmpleado);
router.get('/list', getEmpleados);
router.get('/:id', getEmpleadoById);
router.put('/:id', updateEmpleado);
router.delete('/:id', deleteEmpleado);

module.exports = router;
