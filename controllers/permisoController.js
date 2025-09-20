const permisoService = require('../services/permiso/permisoService');


const createPermiso = async (req, res) => {
  const { nombre,descripcion } = req.body;

  try {
    const newPermiso = await permisoService.createPermisoService({ nombre,descripcion });
    res.status(201).json(newPermiso);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const getPermisoById = async (req, res) => {
    const { id } = req.params;
    try {
      const permiso = await permisoService.getPermisoByIdService({ id });
        if (!permiso) {
          return res.status(404).json({ error: 'Rol not found' });
        }
        res.status(200).json(permiso);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  };

  const getPermisoList = async (req, res) => {
    try {
      const result = await permisoService.getPermisoListService()
      res.status(200).json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };
  
  const updatePermiso = async (req, res) => {
    const permisoId = req.params.id;
    const { nombre,descripcion } = req.body;
    try {
      const updatedPermiso = await permisoService.updatePermisoService(permisoId,{ nombre,descripcion});
      res.status(200).json(updatedPermiso);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  };
  
  const deletePermiso = async (req, res) => {
    const { id } = req.params;
    try {
      const result = await permisoService.deletePermisoService(id);
      res.status(200).json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };

module.exports = {
    createPermiso,
    getPermisoById,
    getPermisoList,
    updatePermiso,
    deletePermiso
  };
  