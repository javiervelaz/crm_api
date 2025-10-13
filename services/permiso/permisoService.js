const e = require('express');
const db = require('../../model/permisos/db');

const createPermisoService = async (permiso) => {
    const { nombre,descripcion } = permiso;
    // Validación de campos requeridos
    if (!descripcion || !nombre ) {
      throw new Error('All fields are required');
    }
    const newPermiso = await db.createPermiso({ nombre,descripcion });
    return newPermiso;
  }; 

  const getPermisoByIdService = async (id, cliente_id) => {
    const result = await db.getPermisoById(id);
    return result.rows[0];
  }

  const getPermisoListService = async () => {
    const result = await db.getPermisos();
    return result.rows;
  }

  const updatePermisoService = async (permisoId,permiso) => {
    const { nombre,descripcion } = permiso;
    if (!nombre || !descripcion ) {
      throw new Error('All fields are required');
    }
    
    const updatedPermiso = await db.updatePermiso(permisoId, { nombre,descripcion});
    return updatedPermiso;
  }

  const deletePermisoService = async (id) => {
    const result = await db.deletePermiso(id);
    if (!result) {
      return res.status(404).json({ error: 'Permiso not found' });
    }
    return result;
  }

  const getPermisoByUserIdService = async (user_id, cliente_id) => {
    const result = await db.getPermisoByUserId(user_id,cliente_id);
    return result;
  }

  module.exports = {
    createPermisoService,
    getPermisoByIdService,
    getPermisoListService,
    updatePermisoService,
    deletePermisoService,
    getPermisoByUserIdService
};