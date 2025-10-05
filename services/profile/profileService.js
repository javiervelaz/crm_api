const e = require('express');
const db = require('../../model/profile/db');
const { emit } = require('../../node');
const bcrypt = require('bcrypt');

const createProfileService = async (data) => {
    const { id_user,dni, telefono, password, legajo, fecha_ingreso ,cliente_id  } = data;
    // Validación de campos requeridos
    
    if (!id_user || !password || !legajo || !telefono) {
      throw new Error('All fields are required');
    }
    const encrypPass = bcrypt.hashSync(password, 10)
    const formattedFechaIngreso = new Date(fecha_ingreso).toISOString().split('T')[0];
    const result = await db.createProfile({ id_user,dni, telefono, password: encrypPass, legajo,fecha_ingreso: formattedFechaIngreso, cliente_id });
    return result;
  }; 

  const getProfileByIdService = async (id, cliente_id) => {
    const result = await db.getProfileById(id,cliente_id);
    return result;
  }

  const getProfileByUserIdService = async (id,cliente_id) => {
    const result = await db.getProfileByUserId(id,cliente_id);
    return result;
  }

  const getProfileListService = async (cliente_id) => {
    const result = await db.getProfiles(cliente_id);
    return result;
  }

  const updateProfileService = async (profileId,data) => {
    let formattedFechaIngreso = null;
    const { dni, telefono, password, legajo, fecha_ingreso,cliente_id} = data;
    if(fecha_ingreso != null) {
      formattedFechaIngreso = new Date(fecha_ingreso).toISOString().split('T')[0];
    }
  
 
    const result = await db.updateProfile(profileId, {dni, telefono, password, legajo, fecha_ingreso:formattedFechaIngreso, cliente_id});
    return result;
  }

  const deleteProfileService = async (id,cliente_id) => {
    const result = await db.deleteProfile(id,cliente_id);
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