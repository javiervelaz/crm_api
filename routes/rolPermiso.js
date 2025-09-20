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
router.get('/list',getRolPermisoList );
router.get('/:id', getRolPermisoById);
router.put('/:id', updateRolPermiso);
router.delete('/:id', deleteRolPermiso);

module.exports = router;
