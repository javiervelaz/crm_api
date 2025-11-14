const express = require('express');
const router = express.Router();
const {
  createRol,
  getRolById,
  getRolList,
  updateRol,
  deleteRol,
} = require('../controllers/rolController');

router.post('/', createRol);
router.get('/list/:cliente_id', getRolList);
router.get('/:id/:cliente_id', getRolById);
router.put('/:id', updateRol);
router.delete('/:id/:cliente_id', deleteRol);

module.exports = router;
