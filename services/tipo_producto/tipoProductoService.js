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

  const getTipoProductoByIdService = async (id, cliente_id) => {
    const result = await db.getTipoProductoById(id, cliente_id);

    return result;
  }

  const getTipoProductoListService = async (cliente_id) => {
    const result = await db.getTipoProductos(cliente_id);
    return result.rows;
  }

  const updateTipoProductoService = async (Id, producto) => {
    const { nombre, cliente_id } = producto;
    if (!nombre ) {
      throw new Error('All fields are required');
    }

    const result = await db.updateTipoProducto(Id, { nombre, cliente_id });
    return result;
  }

  const deleteTipoProductoService = async (id, cliente_id) => {
    const result = await db.deleteTipoProducto(id, cliente_id);
    if (!result) {
      // Antes: `return res.status(...)` sin tener `res` en este scope — tiraba
      // ReferenceError en vez de un 404 limpio. El controller ahora respeta
      // error.status si está presente.
      throw Object.assign(new Error('TipoProducto not found'), { status: 404 });
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