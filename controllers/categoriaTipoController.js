const CategoriaService = require('../services/categoriaTipo/categoriaTipoService');


const createCategoriaTipo = async (req, res) => {
  const { descripcion } = req.body;

  try {
    const data = await CategoriaService.createCategoriaTipoService({ descripcion });
    res.status(201).json(data);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const getCategoriaTipoById = async (req, res) => {
    const { id } = req.params;
    try {
      const Categoria = await CategoriaService.getCategoriaTipoByIdService( id );
        if (!Categoria) {
          return res.status(404).json({ error: 'Categoria tipo not found' });
        }
        res.status(200).json(Categoria);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  };

  const getCategoriaTipoList = async (req, res) => {
    try {
      const result = await CategoriaService.getCategoriaTipoListService()
      res.status(200).json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };
  
  const updateCategoriaTipo = async (req, res) => {
    const id = req.params.id;
    const { descripcion } = req.body;
    try {
      const updatedCategoria = await CategoriaService.updateCategoriaService(id, {descripcion});
      res.status(200).json(updatedCategoria);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  };
  
  const deleteCategoriaTipo = async (req, res) => {
    const { id } = req.params;
    try {
      const result = await CategoriaService.deleteCategoriaTipoService(id);
      res.status(200).json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };

module.exports = {
    createCategoriaTipo,
    getCategoriaTipoById,
    getCategoriaTipoList,
    updateCategoriaTipo,
    deleteCategoriaTipo
  };
  