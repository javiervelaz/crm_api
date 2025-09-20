const pool = require('../../pool');

const createSucursal  = async (suc) => {
    const { nombre,direccion } = suc;
    const result = await pool.query(
      'INSERT INTO "sucursal" ( nombre,direccion ) VALUES ($1, $2) RETURNING *',
      [ nombre,direccion]
    );
    return result.rows[0];
  };
  
  const getSucursalById = async (id) => {
    const result = await pool.query('SELECT * FROM "sucursal" WHERE id = $1', [id]);
    return result;
  };
  
  const getSucursales = async () => {
    const result = await pool.query('SELECT * FROM "sucursal" ', []);
    return result;
  }
  
  
  const updateSucursal  = async (id, sucursal) => {
    const { nombre,direccion  } = sucursal;
    const result = await pool.query(
      'UPDATE "sucursal" SET nombre = $1, direccion = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING *',
      [ nombre,direccion , id]
    );
    return result.rows[0];
  };
  
  const deleteSucursal  = async (id) => {
    const result = await pool.query('DELETE FROM "sucursal" WHERE id = $1 RETURNING *', [id]);
    return result.rows[0];
  };
  
  
  module.exports = {
    createSucursal,
    getSucursalById,
    getSucursales,
    updateSucursal,
    deleteSucursal,
    };