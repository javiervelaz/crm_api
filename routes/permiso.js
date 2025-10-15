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
router.get('/list/:cliente_id', getPermisoList);
router.get('/:id/:cliente_id', getPermisoById);
router.put('/:id', updatePermiso);
router.delete('/:id/:cliente_id', deletePermiso);
router.get('/:user_id/:cliente_id', getPermisoByUserId);

module.exports = router;
