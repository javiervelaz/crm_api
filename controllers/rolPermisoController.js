const rolPermisoService = require('../services/rol_permiso/rolPermisoService');


const createRolPermiso = async (req, res) => {
  const { id_rol, id_permiso } = req.body;

  try {
    const newRolPermiso = await rolPermisoService.createRolPermisoService({ id_rol, id_permiso });
    res.status(201).json(newRolPermiso);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const getRolPermisoById = async (req, res) => {
    const { id } = req.params;
    try {
      const rol = await rolPermisoService.getRolPermisoByIdService({ id });
        if (!rol) {
          return res.status(404).json({ error: 'Rol permiso not found' });
        }
        res.status(200).json(rol);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  };

  const getRolPermisoList = async (req, res) => {
    try {
      const result = await rolPermisoService.getRolPermisoListService()
      res.status(200).json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };
  
  const updateRolPermiso = async (req, res) => {
    const rolpermisoId = req.params.id;
    const { id_rol,id_permiso } = req.body;
    try {
      const updatedRolPermiso = await rolPermisoService.updateRolPermisoService(rolpermisoId, { id_rol,id_permiso});
      res.status(200).json(updatedRolPermiso);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  };
  
  const deleteRolPermiso = async (req, res) => {
    const { id } = req.params;
    try {
      const result = await rolPermisoService.deleteRolPermisoService(id);
      res.status(200).json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };

module.exports = {
    createRolPermiso,
    getRolPermisoById,
    getRolPermisoList,
    updateRolPermiso,
    deleteRolPermiso
  };
  