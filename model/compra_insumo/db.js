const pool = require('../../pool');

const createCompraInsumo  = async (compras) => {
    const { registro_diario_id, insumo, cantidad, precio_total,usuario_id,sucursal_id } = compras;
    const result = await pool.query(
      'INSERT INTO "compra_insumo" (registro_diario_id, insumo, cantidad, precio_total,usuario_id,sucursal_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [registro_diario_id, insumo, cantidad, precio_total,usuario_id,sucursal_id]
    );
    return result.rows[0];
  };
  
  const getCompraInsumoById = async (id) => {
    const result = await pool.query('SELECT * FROM "compra_insumo" WHERE id = $1', [id]);
    return result;
  };
  
  const getComprasInsumos = async () => {
    const result = await pool.query('SELECT * FROM "compra_insumo" ', []);
    return result;
  }
  
  
  const updateCompraInsumo  = async (id, compras) => {
    const {registro_diario_id, insumo, cantidad, precio_total,usuario_id,sucursal_id } = compras;
    const result = await pool.query(
      'UPDATE "compra_insumo" SET fecha = $1, usuario_apertura_id = $2, usuario_cierre_id = $3, caja_inicial = $4,caja_final =$5, sucursal_id=$6, updated_at = CURRENT_TIMESTAMP WHERE id = $7 RETURNING *',
      [registro_diario_id, insumo, cantidad, precio_total,usuario_id,sucursal_id, id]
    );
    return result.rows[0];
  };
  
  const deleteCompraInsumo  = async (id) => {
    const result = await pool.query('DELETE FROM "compra_insumo" WHERE id = $1 RETURNING *', [id]);
    return result.rows[0];
  };
  
  
  module.exports = {
    createCompraInsumo,
    getCompraInsumoById,
    getComprasInsumos,
    updateCompraInsumo,
    deleteCompraInsumo,
    };