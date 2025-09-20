const e = require('express');
const db = require('../../model/profile/db');
const { emit } = require('../../node');
const bcrypt = require('bcrypt');

const createProfileService = async (data) => {
    const { id_user,dni, telefono, password, legajo, fecha_ingreso   } = data;
    // Validación de campos requeridos
    
    if (!id_user || !password || !legajo || !telefono) {
      throw new Error('All fields are required');
    }
    const encrypPass = bcrypt.hashSync(password, 10)
    const formattedFechaIngreso = new Date(fecha_ingreso).toISOString().split('T')[0];
    const result = await db.createProfile({ id_user,dni, telefono, password: encrypPass, legajo,fecha_ingreso: formattedFechaIngreso });
    return result;
  }; 

  const getProfileByIdService = async (id) => {
    const result = await db.getProfileById(id);
    return result.rows[0];
  }

  const getProfileByUserIdService = async (id) => {
    const result = await db.getProfileByUserId(id);
    return result;
  }

  const getProfileListService = async () => {
    const result = await db.getProfiles();
    return result.rows;
  }

  const updateProfileService = async (profileId,data) => {
  
    const { dni, telefono, password, legajo, fecha_ingreso} = data;
    if ( !password || !legajo || !telefono ) {
      throw new Error('All fields are required');
    }
    const formattedFechaIngreso = new Date(fecha_ingreso).toISOString().split('T')[0];
    console.log(formattedFechaIngreso)
    const result = await db.updateProfile(profileId, {dni, telefono, password, legajo, fecha_ingreso:formattedFechaIngreso});
    return result;
  }

  const deleteProfileService = async (id) => {
    const result = await db.deleteProfile(id);
    if (!result) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    return result;
  }

  module.exports = {
    createProfileService,
    getProfileByIdService,
    getProfileListService,
    updateProfileService,
    deleteProfileService,
    getProfileByUserIdService
};