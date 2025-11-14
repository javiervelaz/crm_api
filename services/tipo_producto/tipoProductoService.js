const e = require('express');
const db = require('../../model/tipo_producto/db');
const { datacatalog } = require('googleapis/build/src/apis/datacatalog');

const createTipoProductoService = async (data) => {
    const { nombre, cliente_id } = data;
    // Validación de campos requeridos
    if ( !nombre ) {
      throw new Error('All fields are required');
    }
    const result = await db.createTipoProducto({ nombre, cliente_id });
    return result;
  }; 

  const getTipoProductoByIdService = async (id) => {
    const result = await db.getTipoProductoById(id);
    
    return result;
  }

  const getTipoProductoListService = async (cliente_id) => {
    const result = await db.getTipoProductos(cliente_id);
    return result.rows;
  }

  const updateTipoProductoService = async (Id,producto) => {
    const { nombre } = producto;
    if (!nombre ) {
      throw new Error('All fields are required');
    }
    
    const result = await db.updateTipoProducto(Id, { nombre});
    return result;
  }

  const deleteTipoProductoService = async (id) => {
    const result = await db.deleteTipoProducto(id);
    if (!result) {
      return res.status(404).json({ error: 'TipoProducto not found' });
    }
    return result;
  }

  module.exports = {
    createTipoProductoService,
    getTipoProductoByIdService,
    getTipoProductoListService,
    updateTipoProductoService,
    deleteTipoProductoService
};