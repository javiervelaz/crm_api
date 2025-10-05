const express = require('express');
const { authenticateJWT, authorizeRole } = require('../middleware/authMiddleware');
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
  getUserEstadistica
} = require('../controllers/userController');

const {
  login
} =  require('../controllers/authController');

router.post('/login',login);
router.post('/',authenticateJWT,authorizeRole([1]), createUser);
router.get('/type/:id', getUserTypeById);
router.get('/tipo', getUserTypeList);
router.get('/list/:cliente_id', getUsers);
router.get('/rol/:id/:cliente_id', getUserRol);
router.get('/cliente/:telefono/:cliente_id', getUserByTel);
router.get('/estadistica/cliente/:id/:cliente_id', getUserEstadistica);
router.get('/:id/:cliente_id', getUserById);
router.put('/:id',authenticateJWT,authorizeRole([1]), updateUser);
router.delete('/:id/:cliente_id',authenticateJWT,authorizeRole([1]) ,deleteUser);

module.exports = router;
