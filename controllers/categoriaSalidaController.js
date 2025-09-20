const CategoriaService = require('../services/categoriaSalida/categoriaSalidaService');


const createCategoria = async (req, res) => {
  const { nombre, categoria_tipo_id } = req.body;

  try {
    const newCategoria = await CategoriaService.createCategoriaService({ nombre,categoria_tipo_id });
    res.status(201).json(newCategoria);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const getCategoriaById = async (req, res) => {
    const { id } = req.params;
    try {
      const Categoria = await CategoriaService.getCategoriaByIdService( id);
        if (!Categoria) {
          return res.status(404).json({ error: 'Categoria not found' });
        }
        res.status(200).json(Categoria);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  };

  const getCategoriaList = async (req, res) => {
    try {
      const result = await CategoriaService.getCategoriaListService()
      res.status(200).json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };
  
  const updateCategoria = async (req, res) => {
    const moduloId = req.params.id;
    const { nombre,categoria_tipo_id } = req.body;
    try {
      const updatedCategoria = await CategoriaService.updateCategoriaService(moduloId, {nombre, categoria_tipo_id});
      res.status(200).json(updatedCategoria);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  };
  
  const deleteCategoria = async (req, res) => {
    const { id } = req.params;
    try {
      const result = await CategoriaService.deleteCategoriaService(id);
      res.status(200).json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };

module.exports = {
    createCategoria,
    getCategoriaById,
    getCategoriaList,
    updateCategoria,
    deleteCategoria
  };
  