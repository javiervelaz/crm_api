const e = require('express');
const db = require('../../model/producto/db');

const createProductoService = async (producto) => {
    const { nombre,precio_unitario,tipo_producto_id,permite_mitad,cliente_id } = producto;
    // Validación de campos requeridos
    if (!precio_unitario || !nombre ) {
      throw new Error('All fields are required');
    }
    const newProducto = await db.createProducto({ nombre,precio_unitario,tipo_producto_id , permite_mitad,cliente_id});
    return newProducto;
  }; 

  const getProductoByIdService = async (id,cliente_id) => {
    const result = await db.getProductoById(id,cliente_id);
    return result;
  }

  const getProductoListService = async (cliente_id) => {
    const result = await db.getProductos(cliente_id);
    return result.rows;
  }

  const updateProductoService = async (Id,producto) => {
    const { nombre,precio_unitario,tipo_producto_id,permite_mitad,cliente_id } = producto;
       
    const result = await db.updateProducto(Id, { nombre,precio_unitario,tipo_producto_id,permite_mitad,cliente_id});
    return result;
  }

  const deleteProductoService = async (id,cliente_id) => {
    const result = await db.deleteProducto(id,cliente_id);
    if (!result) {
      return res.status(404).json({ error: 'Producto not found' });
    }
    return result;
  }

  module.exports = {
    createProductoService,
    getProductoByIdService,
    getProductoListService,
    updateProductoService,
    deleteProductoService
};