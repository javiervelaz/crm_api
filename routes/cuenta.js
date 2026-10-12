// routes/cuenta.js
//
// /api/cuenta — credenciales y contraseña. Es el único prefijo que puede usar
// una cuenta con contraseña temporal (middleware/cuentaGuards.js).
const express = require('express');
const { authorizeRole } = require('../middleware/authMiddleware');
const { authorizeModule } = require('../middleware/moduleAuth');
const { registerTenantGuards } = require('../middleware/tenantMiddleware');
const { esExterno } = require('../middleware/cuentaGuards');
const ctrl = require('../controllers/cuentaController');

const router = express.Router();
registerTenantGuards(router);

// Cualquier usuario autenticado: su propia contraseña.
router.post('/password', ctrl.cambiarPassword);

// Gestión de credenciales: sólo staff admin con el módulo usuarios.
// esExterno se chequea aparte porque authorizeRole mira nombres de rol, que
// el admin puede editar (un rol "admin" asignado a un alumno no alcanza).
const soloAdminStaff = [
  (req, res, next) => (esExterno(req.user)
    ? res.status(403).json({ error: 'Tu usuario no tiene acceso a esta sección.', code: 'ROL_SIN_ACCESO' })
    : next()),
  authorizeRole(['admin']),
  authorizeModule('usuarios'),
];

router.get('/tipos', soloAdminStaff, ctrl.getTipos);
router.post('/credenciales', soloAdminStaff, ctrl.crearCredenciales);
router.post('/credenciales/:userId/reset', soloAdminStaff, (req, res, next) => {
  const n = Number(req.params.userId);
  if (!Number.isInteger(n) || n <= 0) return res.status(400).json({ error: 'userId inválido', code: 'INVALID_PARAM' });
  next();
}, ctrl.resetPassword);

module.exports = router;
