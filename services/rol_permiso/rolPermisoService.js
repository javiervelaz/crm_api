const db = require('../../model/rol_permiso/db');

const createRolPermisoService = async (rol_permiso) => {
    const { id_rol,id_permiso } = rol_permiso;
    // Validación de campos requeridos
    if (!id_rol || !id_permiso ) {
      throw new Error('All fields are required');
    }
    const newRolPermiso = await db.createRolPermisoService({ id_rol, id_permiso });
    return newRolPermiso;
  }; 

  const getRolPermisoByIdService = async (id) => {
    const result = await db.getRolPermisoById(id);
    return result.rows[0];
  }

  const getRolPermisoListService = async () => {
    const result = await db.getRolPermisos();
    return result.rows;
  }

  const updateRolPermisoService = async (rolId,rol_permiso) => {
    const { id_rol,id_permiso } = rol_permiso;
    if (!descripcion  ) {
      throw new Error('All fields are required');
    }
    
    const updatedRolPermiso = await db.updateRolPermiso(rolId, { id_rol,id_permiso});
    return updatedRolPermiso;
  }

  const deleteRolPermisoService = async (id) => {
    const result = await db.deleteRolPermiso(id);
    if (!result) {
      return res.status(404).json({ error: 'Rol not found' });
    }
   return result;
  }

  module.exports = {
    createRolPermisoService,
    getRolPermisoByIdService,
    getRolPermisoListService,
    updateRolPermisoService,
    deleteRolPermisoService
};