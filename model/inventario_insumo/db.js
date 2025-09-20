const pool = require('../../pool');

const createInventarioInsumo  = async (invInsumo) => {
    const {sucursal_id, nombre, cantidad } = invInsumo;
    const result = await pool.query(
      'INSERT INTO "inventario_insumos" (nombre, cantidad,sucursal_id) VALUES ($1, $2, $3) RETURNING *',
      [sucursal_id,nombre, cantidad]
    );
    return result.rows[0];
  };
  
  const getInventarioInsumoById = async (id) => {
    const result = await pool.query('SELECT * FROM "inventario_insumos" WHERE id = $1', [id]);
    return result;
  };
  
  const getInventariosInsumos  = async () => {
    const result = await pool.query('SELECT * FROM "inventario_insumos" ', []);
    return result;
  }
  
  
  const updatetInventarioInsumo   = async (id, invInsumo) => {
    const {sucursal_id, nombre, cantidad } = invInsumo;
    const result = await pool.query(
      'UPDATE "inventario_insumos" SET nombre = $1, cantidad = $2, sucursal_id=$3, updated_at = CURRENT_TIMESTAMP WHERE id = $4 RETURNING *',
      [sucursal_id, nombre, cantidad, id]
    );
    return result.rows[0];
  };
  
  const deleteInventarioInsumo  = async (id) => {
    const result = await pool.query('DELETE FROM "inventario_insumos" WHERE id = $1 RETURNING *', [id]);
    return result.rows[0];
  };
  
  
  module.exports = {
    createInventarioInsumo,
    getInventarioInsumoById,
    getInventariosInsumos,
    updatetInventarioInsumo,
    deleteInventarioInsumo,
    };