const ModuloRolService = require('../services/modulo_rol/moduloRolService');


const createModuloRol = async (req, res) => {
  const { id_rol, id_modulo } = req.body;

  try {
    const result = await ModuloRolService.createModuloRolService({ id_rol, id_modulo });
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const getModuloRolById = async (req, res) => {
    const { id } = req.params;
    try {
      const result = await ModuloRolService.getModuloRolByIdService({ id });
        if (!result) {
          return res.status(404).json({ error: 'Modulo rol not found' });
        }
        res.status(200).json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  };

  const getModuloRolList = async (req, res) => {
    try {
      const result = await ModuloRolService.getModuloRolListService();
      res.status(200).json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };
  
  const updateModuloRol = async (req, res) => {
    const moduloId = req.params.id;
    const {id_rol, id_modulo } = req.body;
    try {
      const result = await ModuloRolService.updateModuloRolService(moduloId, {id_rol, id_modulo});
      res.status(200).json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  };
  
  const deleteModuloRol = async (req, res) => {
    const { id } = req.params;
    try {
      const result = await ModuloRolService.deleteModuloRolService(id);
      res.status(200).json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };

module.exports = {
    createModuloRol,
    getModuloRolById,
    getModuloRolList,
    updateModuloRol,
    deleteModuloRol
  };
  