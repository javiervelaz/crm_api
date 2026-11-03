const express = require('express');
const router = express.Router();
const { registerTenantGuards } = require('../middleware/tenantMiddleware');
registerTenantGuards(router);
const {
  createEmpleado,
  getEmpleados,
  getEmpleadoById,
  updateEmpleado,
  deleteEmpleado,
} = require('../controllers/empleadoController');
const { soloAdmin } = require('../middleware/acceso');

// Legajo de empleados: sólo el admin (antes, sin guard).
router.use(soloAdmin);

router.post('/', createEmpleado);
router.get('/list', getEmpleados);
router.get('/:id', getEmpleadoById);
router.put('/:id', updateEmpleado);
router.delete('/:id', deleteEmpleado);

module.exports = router;
