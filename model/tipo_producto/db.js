// db.js
const e = require('express');
const pool = require('../../pool');

const createTipoProducto = async (tp) => {
    const { nombre } = tp;
    const result = await pool.query(
      'INSERT INTO "tipo_producto" (nombre) VALUES ($1) RETURNING *',
      [nombre]
    );
    return result.rows[0];
  }
  
  const getTipoProductoById = async (id) => {
    const result = await pool.query('SELECT * FROM "tipo_producto" WHERE id = $1', [id]);
    return result.rows[0];
  }
  
  const getTipoProductos = async () => {
    const result = await pool.query('SELECT * FROM "tipo_producto"', []);
    return result;
  }
  
  const updateTipoProducto = async (id, tp) => {
    const { nombre } = tp;
    const result = await pool.query(
      'UPDATE "tipo_producto" SET nombre =  $1  WHERE id = $2 RETURNING *',
      [nombre,id]
    );
    return result.rows[0];
  };

  const deleteTipoProducto = async (id) => {
    const result = await pool.query('DELETE FROM "tipo_producto" WHERE id = $1 RETURNING *', [id]);
    return result.rows[0];
  };

  
  module.exports = {
    createTipoProducto,
    getTipoProductoById,
    getTipoProductos,
    updateTipoProducto,
    deleteTipoProducto
    // Exporta las otras funciones aquí...
  };