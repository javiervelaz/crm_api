const ModuloService = require('../services/modulo/moduloService');


const createModulo = async (req, res) => {
  const { descripcion, status } = req.body;

  try {
    const newModulo = await ModuloService.createModuloService({ descripcion,status });
    res.status(201).json(newModulo);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const getModuloById = async (req, res) => {
    const { id } = req.params;
    try {
      const Modulo = await ModuloService.getModuloByIdService({ id });
        if (!Modulo) {
          return res.status(404).json({ error: 'Modulo not found' });
        }
        res.status(200).json(Modulo);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  };

  const getModuloList = async (req, res) => {
    try {
      const result = await ModuloService.getModuloListService()
      res.status(200).json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };
  
  const updateModulo = async (req, res) => {
    const moduloId = req.params.id;
    const { descripcion,status } = req.body;
    try {
      const updatedModulo = await ModuloService.updateModuloService(moduloId, {descripcion, status});
      res.status(200).json(updatedModulo);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  };
  
  const deleteModulo = async (req, res) => {
    const { id } = req.params;
    try {
      const result = await ModuloService.deleteModuloService(id);
      res.status(200).json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };

module.exports = {
    createModulo,
    getModuloById,
    getModuloList,
    updateModulo,
    deleteModulo
  };
  