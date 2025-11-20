const express = require('express');
const { authenticateJWT, authorizeRole } = require('../middleware/authMiddleware');
const { authorizeModule } = require('../middleware/moduleAuth');
const { authorizePermission } = require("../middleware/permissionMiddleware");

const router = express.Router();
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

router.post('/login',login);
router.post('/',authenticateJWT,authorizeRole(['admin']),authorizeModule('usuarios'),authorizePermission('usuarios', 'crear_usuario'), createUser);
router.get('/type/:id', getUserTypeById);
router.get('/tipo', getUserTypeList);
router.get('/list/:cliente_id',authenticateJWT, authorizeModule('usuarios'),authorizePermission('usuarios', 'ver_lista_usuarios'),getUsers);
router.get('/rol/:id/:cliente_id', getUserRol);
router.get('/cliente/:telefono/:cliente_id', getUserByTel);
router.get('/estadistica/cliente/:id/:cliente_id', getUserEstadistica);
router.get('/:id/:cliente_id', getUserById);
router.put('/:id',authenticateJWT,authorizeModule('usuarios'),authorizePermission('usuarios', 'editar_usuario'), updateUser);
router.delete('/:id/:cliente_id',authenticateJWT,authorizeRole(['admin']),authorizeModule('usuarios'),authorizePermission('usuarios', 'eliminar_usuario') ,deleteUser);
router.get("/:id/:cliente_id/modulos-permisos",getUserModulosPermisos)
router.post("/:id/:cliente_id/modulos-permisos",authenticateJWT,authorizeRole(['admin']),postUserModulosPermisos)

module.exports = router;
