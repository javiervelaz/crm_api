const db = require('../../model/user_rol/db');

const createUserRolService = async (userRol) => {
    
    const { id_rol,id_user,cliente_id } = userRol;
    // Validación de campos requeridos
    if (!id_rol || !id_user ) {
      throw new Error('All fields are required');
    }
    const result = await db.createUserRol({ id_rol,id_user ,cliente_id});
   return result;
  }; 

  const getUserRolByIdService = async (id,cliente_id) => {
    const result = await db.getUserRolById(id,cliente_id);
    return result;
  }

  const getUserRolListService = async (cliente_id) => {
    const result = await db.getUserRols(cliente_id);
    return result.rows;
  }

  const updateUserRolService = async (id,data) => {
    const { id_rol, cliente_id } = data;
    if (!id_rol  ) {
      throw new Error('All fields are required');
    }
    
    const result = await db.updateUserRol(id, { id_rol,cliente_id});
    return result;
  }

  const deleteUserRolService = async (id,cliente_id) => {
    const result = await db.deleteUserRol(id,cliente_id);
    if (!result) {
      return res.status(404).json({ error: 'User rol rol not found' });
    }
    return result;
  }

  const getUserRolByUserIdService = async (id,cliente_id) => {
    const result = await db.getUserRoleByUserId(id,cliente_id);
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