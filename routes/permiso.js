const express = require('express');
const router = express.Router();
const {
  createPermiso,
  getPermisoById,
  getPermisoList,
  updatePermiso,
  deletePermiso,
  getPermisoByUserId
} = require('../controllers/permisoController');

router.post('/', createPermiso);
router.get('/list', getPermisoList);
router.get('/:id', getPermisoById);
router.put('/:id', updatePermiso);
router.delete('/:id', deletePermiso);
router.get('/:user_id/:cliente_id', getPermisoByUserId);

module.exports = router;
