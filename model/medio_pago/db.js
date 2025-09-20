// db.js
const pool = require('../../pool');

const createMedioPago = async (data) => {
    const { descripcion } = data;
    const result = await pool.query(
      'INSERT INTO "medio_pago" (descripcion) VALUES ($1) RETURNING *',
      [descripcion]
    );
    return result.rows[0];
  }
  
  const getMedioPagoById = async (id) => {
    const result = await pool.query('SELECT * FROM "medio_pago" WHERE id = $1', [id]);
    return result.rows[0];
  }
  
  const getMedioPagos = async () => {
    const result = await pool.query('SELECT * FROM "medio_pago"', []);
    return result;
  }
  
  const updateMedioPago = async (id, tp) => {
    const { descripcion } = tp;
    const result = await pool.query(
      'UPDATE "medio_pago" SET descripcion =  $1  WHERE id = $2 RETURNING *',
      [descripcion,id]
    );
    return result.rows[0];
  };

  const deleteMedioPago = async (id) => {
    const result = await pool.query('DELETE FROM "medio_pago" WHERE id = $1 RETURNING *', [id]);
    return result.rows[0];
  };

  
  module.exports = {
    createMedioPago,
    getMedioPagoById,
    getMedioPagos,
    updateMedioPago,
    deleteMedioPago
    // Exporta las otras funciones aquí...
  };