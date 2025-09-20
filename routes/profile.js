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
router.get('/list', getProfiles);
router.get('/:id', getProfileById);
router.put('/:id', updateProfile);
router.delete('/:id', deleteProfile);
router.get('/user/:id', getProfileByUserId);

module.exports = router;
