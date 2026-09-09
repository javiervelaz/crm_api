const e = require('express');
const db = require('../../model/producto/db');

// Validación de precio (bugs 30/31):
// - distingue 0 de vacío (antes `!precio` marcaba el 0 como "campo requerido")
// - rechaza negativos y 0 (el precio debe ser mayor a 0)
const validarPrecio = (precio_unitario) => {
  if (precio_unitario === null || precio_unitario === undefined || precio_unitario === '') {
    const err = new Error('El precio es requerido'); err.status = 400; throw err;
  }
  const n = Number(precio_unitario);
  if (Number.isNaN(n)) {
    const err = new Error('El precio debe ser un número válido'); err.status = 400; throw err;
  }
  if (n <= 0) {
    const err = new Error('El precio debe ser mayor a 0'); err.status = 400; throw err;
  }
};

const createProductoService = async (producto) => {
    const { nombre,precio_unitario,tipo_producto_id,permite_mitad,cliente_id } = producto;
    if (!nombre || String(nombre).trim() === '') {
      const err = new Error('El nombre es requerido'); err.status = 400; throw err;
    }
    validarPrecio(precio_unitario);
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
    if (!nombre || String(nombre).trim() === '') {
      const err = new Error('El nombre es requerido'); err.status = 400; throw err;
    }
    validarPrecio(precio_unitario);
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