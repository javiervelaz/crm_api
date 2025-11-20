const express = require('express');
const { authenticateJWT, authorizeRole } = require('../middleware/authMiddleware');
const { authorizeModule } = require('../middleware/moduleAuth');
const { authorizePermission } = require("../middleware/permissionMiddleware");

const router = express.Router();
const {
    createProfile,
    getProfileById,
    getProfiles,
    updateProfile,
    deleteProfile,
    getProfileByUserId
} = require('../controllers/profileController');

router.post('/', createProfile);
router.get('/list/:cliente_id', getProfiles);
router.get('/:id/:cliente_id', getProfileById);
router.put('/:id', updateProfile);
router.delete('/:id/:cliente_id',authenticateJWT ,deleteProfile);
router.get('/user/:id/:cliente_id', getProfileByUserId);

module.exports = router;
