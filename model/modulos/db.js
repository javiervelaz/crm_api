// db.js
const pool = require('../../pool');

const createModulo = async (Modulo) => {
    const { descripcion,status } = Modulo;
    const result = await pool.query(
      'INSERT INTO modulo (descripcion,status) VALUES ($1,$2) RETURNING *',
      [descripcion,status]
    );
    return result.rows[0];
  }
  
  const getModuloById = async (id) => {
    const result = await pool.query('SELECT * FROM modulo WHERE id = $1', [id]);
    return result.rows[0];
  }
  
  const getModulos = async () => {
    const result = await pool.query('SELECT * FROM modulo', []);
    return result.rows;
  }
  
  const updateModulo = async (id, Modulo) => {
    const { descripcion,status } = Modulo;
    const result = await pool.query(
      'UPDATE modulo SET descripcion = $1,status = $2 updated_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING *',
      [descripcion, status, id]
    );
    return result.rows[0];
  };

  const deleteModulo = async (id) => {
    const result = await pool.query('DELETE FROM modulo WHERE id = $1 RETURNING *', [id]);
    return result.rows[0];
  };
  
  module.exports = {
    createModulo,
    getModuloById,
    getModulos,
    updateModulo,
    deleteModulo
    // Exporta las otras funciones aquí...
  };