const db = require('../../model/rol_permiso/db');

const createRolPermisoService = async (rol_permiso) => {
    const { id_rol,id_permiso,cliente_id } = rol_permiso;
    // Validación de campos requeridos
    if (!id_rol || !id_permiso ) {
      throw new Error('All fields are required');
    }
    const newRolPermiso = await db.createRolPermiso({ id_rol, id_permiso,cliente_id });
    return newRolPermiso;
  }; 

  const getRolPermisoByIdService = async (id,cliente_id) => {
    const result = await db.getRolPermisoById(id,cliente_id);
    return result;
  }

  const getRolPermisoListService = async (cliente_id) => {
    const result = await db.getRolPermisos(cliente_id);
    return result;
  }

  const updateRolPermisoService = async (rolId,rol_permiso) => {
    const { id_permiso,cliente_id } = rol_permiso;
 
    const updatedRolPermiso = await db.updateRolPermiso(rolId, { id_permiso,cliente_id});
    return updatedRolPermiso;
  }

  const deleteRolPermisoService = async (id,cliente_id) => {
    const result = await db.deleteRolPermiso(id,cliente_id);
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