const rolService = require('../services/rol/rolService');


const createRol = async (req, res) => {
  const { descripcion } = req.body;

  try {
    const newRol = await rolService.createRolService({ descripcion });
    res.status(201).json(newRol);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const getRolById = async (req, res) => {
    const { id } = req.params;
    try {
      const rol = await rolService.getRolByIdService({ id });
        if (!rol) {
          return res.status(404).json({ error: 'Rol not found' });
        }
        res.status(200).json(rol);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  };

  const getRolList = async (req, res) => {
    try {
      const result = await rolService.getRolListService()
      res.status(200).json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };
  
  const updateRol = async (req, res) => {
    const rooId = req.params.id;
    const { descripcion } = req.body;
    try {
      const updatedRol = await rolService.updateRolService(rooId, {descripcion});
      res.status(200).json(updatedRol);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  };
  
  const deleteRol = async (req, res) => {
    const { id } = req.params;
    try {
      const result = await rolService.deleteRolService(id);
      res.status(200).json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };

module.exports = {
    createRol,
    getRolById,
    getRolList,
    updateRol,
    deleteRol
  };
  