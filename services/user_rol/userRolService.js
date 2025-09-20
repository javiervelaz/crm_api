const db = require('../../model/user_rol/db');

const createUserRolService = async (userRol) => {
    
    const { id_rol,id_user } = userRol;
    // Validación de campos requeridos
    if (!id_rol || !id_user ) {
      throw new Error('All fields are required');
    }
    const result = await db.createUserRol({ id_rol,id_user });
   return result;
  }; 

  const getUserRolByIdService = async (id) => {
    const result = await db.getUserRolById(id);
    return result.rows[0];
  }

  const getUserRolListService = async () => {
    const result = await db.getUserRols();
    return result.rows;
  }

  const updateUserRolService = async (id,data) => {
    const { id_rol,id_user } = data;
    if (!id_rol || !id_user ) {
      throw new Error('All fields are required');
    }
    
    const result = await db.updateUserRol(id, { id_rol,id_user});
    return result;
  }

  const deleteUserRolService = async (id) => {
    const result = await db.deleteUserRol(id);
    if (!result) {
      return res.status(404).json({ error: 'User rol rol not found' });
    }
    return result;
  }

  const getUserRolByUserIdService = async (id) => {
    const result = await db.getUserRoleByUserId(id);
    return result;
  }

  module.exports = {
    createUserRolService,
    getUserRolByIdService,
    getUserRolListService,
    updateUserRolService,
    deleteUserRolService,
    getUserRolByUserIdService
};