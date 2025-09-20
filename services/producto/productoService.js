const e = require('express');
const db = require('../../model/producto/db');

const createProductoService = async (producto) => {
    const { nombre,precio_unitario,tipo_producto_id,permite_mitad } = producto;
    // Validación de campos requeridos
    if (!precio_unitario || !nombre ) {
      throw new Error('All fields are required');
    }
    const newProducto = await db.createProducto({ nombre,precio_unitario,tipo_producto_id , permite_mitad});
    return newProducto;
  }; 

  const getProductoByIdService = async (id) => {
    const result = await db.getProductoById(id);
    return result;
  }

  const getProductoListService = async () => {
    const result = await db.getProductos();
    return result.rows;
  }

  const updateProductoService = async (Id,producto) => {
    const { nombre,precio_unitario,tipo_producto_id,permite_mitad } = producto;
    if (!nombre || !precio_unitario ) {
      throw new Error('All fields are required');
    }
    
    const result = await db.updateProducto(Id, { nombre,precio_unitario,tipo_producto_id,permite_mitad});
    return result;
  }

  const deleteProductoService = async (id) => {
    const result = await db.deleteProducto(id);
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