const pool = require('../../pool');

const createMovimientoInventario  = async (RegistroDiario) => {
    const { registro_diario_id, categoria, descripcion, monto,usuario_id,sucursal_id } = RegistroDiario;
    const result = await pool.query(
      'INSERT INTO "movimiento_inventario" (registro_diario_id, categoria, descripcion, monto,usuario_id,sucursal_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [registro_diario_id, categoria, descripcion, monto,usuario_id,sucursal_id]
    );
    return result.rows[0];
  };
  
  const getMovimientoInventarioById = async (id) => {
    const result = await pool.query('SELECT * FROM "movimiento_inventario" WHERE id = $1', [id]);
    return result;
  };
  
  const getMovimientosInventarios = async () => {
    const result = await pool.query('SELECT * FROM "movimiento_inventario" ', []);
    return result;
  }
  
  
  const updatetMovimientoInventario  = async (id, RegistroDiario) => {
    const {registro_diario_id, categoria, descripcion, monto,usuario_id,sucursal_id } = RegistroDiario;
    const result = await pool.query(
      'UPDATE "movimiento_inventario" SET fecha = $1, usuario_apertura_id = $2, usuario_cierre_id = $3, caja_inicial = $4,caja_final =$5, sucursal_id=$6, updated_at = CURRENT_TIMESTAMP WHERE id = $7 RETURNING *',
      [registro_diario_id, categoria, descripcion, monto,usuario_id,sucursal_id, id]
    );
    return result.rows[0];
  };
  
  const deletetMovimientoInventario  = async (id) => {
    const result = await pool.query('DELETE FROM "movimiento_inventario" WHERE id = $1 RETURNING *', [id]);
    return result.rows[0];
  };
  
  
  module.exports = {
    createMovimientoInventario,
    getMovimientoInventarioById,
    getMovimientosInventarios,
    updatetMovimientoInventario,
    deletetMovimientoInventario,
    };