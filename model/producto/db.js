// db.js
const e = require('express');
const pool = require('../../pool');

const createProducto = async (prod) => {
    const { nombre,precio_unitario,tipo_producto_id,permite_mitad } = prod;
    const result = await pool.query(
      'INSERT INTO "producto" (nombre,precio_unitario, tipo_producto_id,permite_mitad) VALUES ($1,$2,$3,$4) RETURNING *',
      [nombre,precio_unitario,tipo_producto_id,permite_mitad]
    );
    return result.rows[0];
  }
  
  const getProductoById = async (id) => {
    const result = await pool.query('SELECT * FROM "producto" WHERE id = $1', [id]);
    return result.rows[0];
  }
  
  const getProductos = async () => {
    const result = await pool.query('SELECT p.id,p.nombre,p.precio_unitario, tp.nombre as tipo_producto,p.tipo_producto_id, p.permite_mitad FROM "producto" p join "tipo_producto" tp on p.tipo_producto_id=tp.id ', []);
    return result;
  }
  
  const updateProducto = async (id, prod) => {
    const { nombre,precio_unitario,tipo_producto_id,permite_mitad } = prod;
    const result = await pool.query(
      'UPDATE "producto" SET nombre =  $1, precio_unitario= $2 , tipo_producto_id = $3 , permite_mitad = $4  WHERE id = $5 RETURNING *',
      [nombre,precio_unitario,tipo_producto_id,permite_mitad,id]
    );
    return result.rows[0];
  };

  const deleteProducto = async (id) => {
    const result = await pool.query('DELETE FROM "producto" WHERE id = $1 RETURNING *', [id]);
    return result.rows[0];
  };

  
  module.exports = {
    createProducto,
    getProductoById,
    getProductos,
    updateProducto,
    deleteProducto
    // Exporta las otras funciones aquí...
  };