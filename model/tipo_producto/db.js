// db.js
const e = require('express');
const pool = require('../../pool');

const createTipoProducto = async (tp) => {
    const { nombre, cliente_id } = tp;
    const result = await pool.query(
      'INSERT INTO "tipo_producto" (nombre,cliente_id) VALUES ($1, $2) RETURNING *',
      [nombre,cliente_id]
    );
    return result.rows[0];
  }
  
  const getTipoProductoById = async (id, cliente_id) => {
  const result = await pool.query(
      'SELECT * FROM "tipo_producto" WHERE id = $1 AND cliente_id = $2::int',
      [id, cliente_id]
    );
    return result.rows[0];
  };
  
  const getTipoProductos = async (cliente_id) => {
    const result = await pool.query('SELECT * FROM "tipo_producto" where cliente_id= $1', [cliente_id]);
    return result;
  }
  
  const updateTipoProducto = async (id, tp) => {
    const { nombre, cliente_id } = tp;
    if (!cliente_id) throw new Error('cliente_id requerido');

    const { rows, rowCount } = await pool.query(
      `UPDATE "tipo_producto"
          SET nombre = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2 AND cliente_id = $3::int
        RETURNING *`,
      [nombre, id, cliente_id]
    );
    // 0 filas = no existe o es de otro tenant. Misma respuesta para ambos:
    // no confirmamos la existencia de recursos ajenos.
    if (rowCount === 0) throw Object.assign(new Error('Tipo de producto no encontrado'), { status: 404 });
      return rows[0];
  };

  const deleteTipoProducto = async (id, cliente_id) => {
    if (!cliente_id) throw new Error('cliente_id requerido');
    const result = await pool.query(
      'DELETE FROM "tipo_producto" WHERE id = $1 AND cliente_id = $2::int RETURNING *',
      [id, cliente_id]
    );
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