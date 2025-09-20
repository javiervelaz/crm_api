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
router.get('/list', getUsers);
router.get('/:id', getUserById);
router.put('/:id',authenticateJWT,authorizeRole([1]), updateUser);
router.delete('/:id',authenticateJWT,authorizeRole([1]) ,deleteUser);
router.get('/type/:id', getUserTypeById);
router.get('/tipo/list', getUserTypeList);
router.get('/rol/:id', getUserRol);
router.get('/cliente/:telefono', getUserByTel);
router.get('/estadistica/cliente/:id', getUserEstadistica);

module.exports = router;
