const express = require('express');
const router = express.Router();
const {
  createRolPermiso,
  getRolPermisoById,
  getRolPermisoList,
  updateRolPermiso,
  deleteRolPermiso,
} = require('../controllers/rolPermisoController');

router.post('/', createRolPermiso);
router.get('/list/:cliente_id',getRolPermisoList );
router.get('/:id/:cliente_id', getRolPermisoById);
router.put('/:id', updateRolPermiso);
router.delete('/:id/:cliente_id', deleteRolPermiso);

module.exports = router;
