const express = require('express');
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
router.delete('/:id/:cliente_id', deleteProfile);
router.get('/user/:id/:cliente_id', getProfileByUserId);

module.exports = router;
