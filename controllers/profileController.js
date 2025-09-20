
const profileService = require('../services/profile/profileService');


const createProfile = async (req, res) => {
  const {  id_user,dni, telefono, password, legajo, fecha_ingreso  } = req.body;

  try {
    const result = await profileService.createProfileService({  id_user,dni, telefono, password, legajo, fecha_ingreso  });
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const getProfileById = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await profileService.getProfileByIdService(id);
      if (!result) {
        return res.status(404).json({ error: 'Profile not found' });
      }
      res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getProfileByUserId = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await profileService.getProfileByUserIdService(id);
      if (!result) {
        return res.status(404).json({ error: 'Profile not found' });
      }
      res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};


const getProfiles = async (req, res) => {
  try {
    const result = await profileService.getProfileListService();
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const updateProfile = async (req, res) => {
  const profileId = req.params.id;
  const {  dni, telefono,password, legajo, fecha_ingreso } = req.body;
  try {
    const result = await profileService.updateProfileService(profileId, {  dni, telefono,password, legajo, fecha_ingreso  });
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const deleteProfile = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await profileService.deleteProfileService(id);
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
    createProfile,
    getProfileById,
    getProfiles,
    updateProfile,
    deleteProfile,
    getProfileByUserId
};

