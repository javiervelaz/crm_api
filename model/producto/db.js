// db.js
const e = require('express');
const pool = require('../../pool');

const createProducto = async (prod) => {
    const { nombre,precio_unitario,tipo_producto_id,permite_mitad ,cliente_id} = prod;
    const result = await pool.query(
      'INSERT INTO "producto" (nombre,precio_unitario, tipo_producto_id,permite_mitad,cliente_id) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [nombre,precio_unitario,tipo_producto_id,permite_mitad,cliente_id]
    );
    return result.rows[0];
  }
  
  const getProductoById = async (id,cliente_id) => {
    const result = await pool.query(`
      SELECT 
        p.id,
        p.nombre,
        p.precio_unitario, 
        p.tipo_producto_id, 
        p.permite_mitad,
        (
          SELECT pi.nombre
          FROM producto_img pi
          WHERE pi.producto_id = p.id
          ORDER BY pi.id
          LIMIT 1
        ) AS imagen_url,
         cliente_id
      FROM 
      "producto"  p
      WHERE p.id = $1 and p.cliente_id = $2`, [id,cliente_id]);
    return result.rows[0];
  }
  
  const getProductos = async (cliente_id) => {
    const result = await pool.query(`
      SELECT p.id,
      p.nombre,
      p.precio_unitario, 
      tp.nombre as tipo_producto,
      p.tipo_producto_id, 
      p.permite_mitad,
      (
        SELECT pi.nombre
        FROM producto_img pi
        WHERE pi.producto_id = p.id
        ORDER BY pi.id
        LIMIT 1
      ) AS imagen_url
      FROM "producto" p 
      join "tipo_producto" tp on p.tipo_producto_id=tp.id
      where p.cliente_id = $1 `, [cliente_id]);
    return result;
  }

  const updateProducto = async (id, prod) => {
    const {
      nombre = null,
      precio_unitario = null,
      tipo_producto_id = null,
      permite_mitad = null,
      cliente_id,
    } = prod;
  
    // Validaciones mínimas
    if (!id) throw new Error('Falta id');
    if (!cliente_id) throw new Error('Falta cliente_id');
  
    const { rows, rowCount } = await pool.query(
      `
      UPDATE "producto"
      SET
        nombre          = COALESCE($1, nombre),
        precio_unitario = COALESCE($2, precio_unitario),
        tipo_producto_id= COALESCE($3, tipo_producto_id),
        permite_mitad   = COALESCE($4, permite_mitad)
      WHERE id = $6 AND cliente_id = $5
      RETURNING *;
      `,
      [
        // Mapear undefined -> null para que COALESCE funcione
        nombre ?? null,
        precio_unitario ?? null,
        tipo_producto_id ?? null,
        permite_mitad ?? null,
        cliente_id,
        id,
      ]
    );
  
    if (rowCount === 0) throw new Error('Producto no encontrado');
    return rows[0];
  };
  

  const deleteProducto = async (id,cliente_id) => {
    const result = await pool.query('DELETE FROM "producto" WHERE id = $1 and cliente_id =$2 RETURNING *', [id,cliente_id ]);
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