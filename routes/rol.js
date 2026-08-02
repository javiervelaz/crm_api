const express = require('express');
const router = express.Router();
const { enforceParamTenant } = require('../middleware/tenantMiddleware');
router.use(enforceParamTenant);
const { authenticateJWT, authorizeRole } = require('../middleware/authMiddleware');
const {
  createRol,
  getRolById,
  getRolList,
  updateRol,
  deleteRol,
  getRolModulosPermisos,
  postRolModulosPermisos
} = require('../controllers/rolController');

router.post('/', authenticateJWT, authorizeRole(['admin']), createRol);
router.get('/list/:cliente_id', authenticateJWT, getRolList);
router.get('/:id/:cliente_id', authenticateJWT, getRolById);
router.put('/:id', authenticateJWT, authorizeRole(['admin']), updateRol);
router.delete('/:id/:cliente_id', authenticateJWT, authorizeRole(['admin']), deleteRol);
router.get('/:rol_id/:cliente_id/modulos-permisos', authenticateJWT, getRolModulosPermisos);
router.post('/:rol_id/:cliente_id/modulos-permisos', authenticateJWT, authorizeRole(['admin']), postRolModulosPermisos);


module.exports = router;
