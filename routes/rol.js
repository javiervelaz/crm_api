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
router.get('/list', getRolList);
router.get('/:id', getRolById);
router.put('/:id', updateRol);
router.delete('/:id', deleteRol);

module.exports = router;
