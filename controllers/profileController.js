
const profileService = require('../services/profile/profileService');


const createProfile = async (req, res) => {
  const {  id_user,dni, telefono, password, legajo, fecha_ingreso ,cliente_id } = req.body;

  try {
    const result = await profileService.createProfileService({  id_user,dni, telefono, password, legajo, fecha_ingreso ,cliente_id });
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const getProfileById = async (req, res) => {
  const { id ,cliente_id} = req.params;
  try {
    const result = await profileService.getProfileByIdService(id,cliente_id);
      if (!result) {
        return res.status(404).json({ error: 'Profile not found' });
      }
      res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getProfileByUserId = async (req, res) => {
  const { id ,cliente_id} = req.params;
  try {
    const result = await profileService.getProfileByUserIdService(id,cliente_id);
      if (!result) {
        return res.status(404).json({ error: 'Profile not found' });
      }
      res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};


const getProfiles = async (req, res) => {
  const {  cliente_id } = req.params;
  if(!cliente_id) return res.status(404).json( { error: "No se puede filtrar por cliente"});
  try {
    const result = await profileService.getProfileListService(cliente_id);
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const updateProfile = async (req, res) => {
  const profileId = req.params.id;
  console.log("body",req.body)
  const {  dni, telefono,password, legajo, fecha_ingreso ,cliente_id} = req.body;
  
  try {
    const result = await profileService.updateProfileService(profileId, {  dni, telefono,password, legajo, fecha_ingreso,cliente_id  });
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const deleteProfile = async (req, res) => {
  const { id,cliente_id } = req.params;
  try {
    const result = await profileService.deleteProfileService(id,cliente_id);
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

