const db = require('../../model/categoria_salida/db');

const createCategoriaService = async (data) => {
    const { nombre, categoria_tipo_id, cliente_id} = data;
    // Validación de campos requeridos
    if (!nombre  ) {
      throw new Error('All fields are required');
    }
    const result = await db.createCategoria({ nombre, categoria_tipo_id, cliente_id });
    return result;
  }; 

  const getCategoriaByIdService = async (id, cliente_id) => {
    const result = await db.getCategoriaById(id, cliente_id);
    return result.rows[0];
  }

  const getCategoriaListService = async (cliente_id) => {
    const result = await db.getCategorias(cliente_id);
    return result.rows;
  }

  const updateCategoriaService = async (Id,data) => {
    const { nombre,categoria_tipo_id, cliente_id } = data;
    if (!nombre  ) {
      throw new Error('All fields are required');
    }
    
    const result = await db.updateCategoria(Id, { nombre, categoria_tipo_id , cliente_id});
    return result;
  }

  const deleteCategoriaService = async (id, cliente_id) => {
    const result = await db.deleteCategoria(id, cliente_id);
    if (!result) {
      return res.status(404).json({ error: 'Categoria not found' });
    }
    return result;
  }

  module.exports = {
    createCategoriaService,
    getCategoriaByIdService,
    getCategoriaListService,
    updateCategoriaService,
    deleteCategoriaService
};