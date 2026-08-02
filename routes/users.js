const express = require('express');
const { authenticateJWT, authorizeRole } = require('../middleware/authMiddleware');
const { authorizeModule } = require('../middleware/moduleAuth');
const { authorizePermission } = require("../middleware/permissionMiddleware");

const router = express.Router();
const { enforceParamTenant } = require('../middleware/tenantMiddleware');
router.use(enforceParamTenant);
const {
  createUser,
  getUsers,
  getUserById,
  updateUser,
  deleteUser,
  getUserTypeById,
  getUserRol,
  getUserByTel,
  getUserTypeList,
  getUserEstadistica,
  getUserModulosPermisos,
  postUserModulosPermisos
} = require('../controllers/userController');

const {
  login
} =  require('../controllers/authController');

router.post('/login', login);
router.post('/', authenticateJWT, authorizeRole(['admin']), authorizeModule('usuarios'), authorizePermission('usuarios', 'usuarios.create'), createUser);
router.get('/type/:id', authenticateJWT, getUserTypeById);
router.get('/tipo', authenticateJWT, getUserTypeList);
router.get('/list/:cliente_id', authenticateJWT, authorizeModule('usuarios'), authorizePermission('usuarios', 'usuarios.list'), getUsers);
router.get('/rol/:id/:cliente_id', authenticateJWT, getUserRol);
router.get('/cliente/:telefono/:cliente_id', authenticateJWT, getUserByTel);
router.get('/estadistica/cliente/:id/:cliente_id', authenticateJWT, getUserEstadistica);
router.get('/:id/:cliente_id', authenticateJWT, getUserById);
router.put('/:id', authenticateJWT, authorizeModule('usuarios'), authorizePermission('usuarios', 'usuarios.update'), updateUser);
router.delete('/:id/:cliente_id', authenticateJWT, authorizeRole(['admin']), authorizeModule('usuarios'), authorizePermission('usuarios', 'usuarios.delete'), deleteUser);
router.get("/:id/:cliente_id/modulos-permisos", authenticateJWT, getUserModulosPermisos);
router.post("/:id/:cliente_id/modulos-permisos", authenticateJWT, authorizeRole(['admin']), postUserModulosPermisos);

module.exports = router;
