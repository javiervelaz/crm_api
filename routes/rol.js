const express = require('express');
const router = express.Router();
const {
  createRol,
  getRolById,
  getRolList,
  updateRol,
  deleteRol,
  getRolModulosPermisos,
  postRolModulosPermisos
} = require('../controllers/rolController');

router.post('/', createRol);
router.get('/list/:cliente_id', getRolList);
router.get('/:id/:cliente_id', getRolById);
router.put('/:id', updateRol);
router.delete('/:id/:cliente_id', deleteRol);
router.get('/:rol_id/:cliente_id/modulos-permisos', getRolModulosPermisos);
router.post('/:rol_id/:cliente_id/modulos-permisos', postRolModulosPermisos);


module.exports = router;
