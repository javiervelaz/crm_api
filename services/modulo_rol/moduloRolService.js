const db = require('../../model/modulo_rol/db');

const createModuloRolService = async (moduloRol) => {
    const { id_rol,id_modulo } = moduloRol;
    // Validación de campos requeridos
    if (!id_rol || !id_modulo ) {
      throw new Error('All fields are required');
    }
    const result = await db.createModuloRol({ id_rol,id_modulo });
   return result;
  }; 

  const getModuloRolByIdService = async (id) => {
    const result = await db.getModuloRolById(id);
    return result.rows[0];
  }

  const getModuloRolListService = async () => {
    const result = await db.getModuloRols();
    return result.rows;
  }

  const updateModuloRolService = async (id,data) => {
    const { id_rol,id_modulo } = data;
    if (!id_rol || !id_modulo ) {
      throw new Error('All fields are required');
    }
    
    const result = await db.updateModuloRol(id, { id_rol,id_modulo});
    return result;
  }

  const deleteModuloRolService = async (id) => {
    const result = await db.deleteModulo(id);
    if (!result) {
      return res.status(404).json({ error: 'Modulo rol not found' });
    }
    return result;
  }

  module.exports = {
    createModuloRolService,
    getModuloRolByIdService,
    getModuloRolListService,
    updateModuloRolService,
    deleteModuloRolService
};