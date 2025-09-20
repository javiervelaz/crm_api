// db.js
const e = require('express');
const pool = require('../../pool');

const createRol = async (rol) => {
    const { descripcion } = rol;
    const result = await pool.query(
      'INSERT INTO rol (descripcion) VALUES ($1) RETURNING *',
      [descripcion]
    );
    return result.rows[0];
  }
  
  const getRolById = async (id) => {
    const result = await pool.query('SELECT * FROM "rol" WHERE id = $1', [id]);
    return result.rows[0];
  }
  
  const getRols = async () => {
    const result = await pool.query('SELECT * FROM "rol"', []);
    return result;
  }
  
  const updateRol = async (id, rol) => {
    const { descripcion } = rol;
    const result = await pool.query(
      'UPDATE "rol" SET descripcion = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [descripcion]
    );
    return result.rows[0];
  };

  const deleteRol = async (id) => {
    const result = await pool.query('DELETE FROM "rol" WHERE id = $1 RETURNING *', [id]);
    return result.rows[0];
  };
  
  module.exports = {
    createRol,
    getRolById,
    getRols,
    updateRol,
    deleteRol
    // Exporta las otras funciones aquí...
  };