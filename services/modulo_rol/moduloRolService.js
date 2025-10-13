const db = require('../../model/modulo_rol/db');

const createModuloRolService = async (moduloRol) => {
    const { id_rol,id_modulo, cliente_id } = moduloRol;
    // Validación de campos requeridos
    if (!id_rol || !id_modulo ) {
      throw new Error('All fields are required');
    }
    const result = await db.createModuloRol({ id_rol,id_modulo ,cliente_id});
   return result;
  }; 

  const getModuloRolByIdService = async (id,cliente_id) => {
    const result = await db.getModuloRolById(id,cliente_id);
    return result;
  }

  const getModuloRolListService = async (cliente_id) => {
    const result = await db.getModuloRols(cliente_id);
    return result;
  }

  const updateModuloRolService = async (id,data) => {
    const { id_rol,id_modulo, cliente_id } = data;
    if (!id_rol && !id_modulo ) {
      throw new Error('All fields are required');
    }
    
    const result = await db.updateModuloRol(id, { id_rol,id_modulo,cliente_id});
    return result;
  }

  const deleteModuloRolService = async (id,cliente_id) => {
    const result = await db.deleteModuloRol(id,cliente_id);
    if (!result) {
      return res.status(404).json({ error: 'Modulo rol not found' });
    }
    return result;
  }

  const getUserRolModuloByUserIdService = async (user_id, cliente_id) => {
    const result = await db.getUserModuloRolByUserId(user_id, cliente_id);
    return result;
  }

  module.exports = {
    createModuloRolService,
    getModuloRolByIdService,
    getModuloRolListService,
    updateModuloRolService,
    deleteModuloRolService,
    getUserRolModuloByUserIdService
};