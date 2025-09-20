const db = require('../../model/categoria_tipo/db');

const createCategoriaTipoService = async (data) => {
    const { descripcion } = data;
    // Validación de campos requeridos
    if (!descripcion  ) {
      throw new Error('All fields are required');
    }
    const result = await db.createCategoriaTipo({ descripcion });
    return result;
  }; 

  const getCategoriaTipoByIdService = async (id) => {
    const result = await db.getCategoriaTipoById(id);
    return result.rows[0];
  }

  const getCategoriaTipoListService = async () => {
    const result = await db.getCategoriaTipo();
    return result.rows;
  }

  const updateCategoriaTipoService = async (Id,data) => {
    const { descripcion } = data;
    if (!descripcion  ) {
      throw new Error('All fields are required');
    }
    
    const result = await db.updateCategoriaTipo(Id, { descripcion });
    return result;
  }

  const deleteCategoriaTipoService = async (id) => {
    const result = await db.deleteCategoriaTipo(id);
    if (!result) {
      return res.status(404).json({ error: 'Categoria tipo not found' });
    }
    return result;
  }

  module.exports = {
    createCategoriaTipoService,
    getCategoriaTipoByIdService,
    getCategoriaTipoListService,
    updateCategoriaTipoService,
    deleteCategoriaTipoService
};