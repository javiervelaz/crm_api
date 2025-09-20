// db.js
const e = require('express');
const pool = require('../../pool');

const createModuloRol = async (rol) => {
    const { id_rol, id_modulo } = rol;
    const result = await pool.query(
      'INSERT INTO modulo_rol (id_rol, id_modulo) VALUES ($1,$2) RETURNING *',
      [id_rol, id_modulo]
    );
    return result.rows[0];
  }
  
  const getModuloRolById = async (id) => {
    const result = await pool.query('SELECT * FROM modulo_rol WHERE id = $1', [id]);
    return result.rows[0];
  }
  
  const getModuloRols = async () => {
    const result = await pool.query('SELECT * FROM modulo_rol', []);
    return result.rows;
  }
  
  const updateModuloRol = async (id, rol) => {
    const { id_rol, id_modulo } = rol;
    const result = await pool.query(
      'UPDATE modulo_rol SET id_rol =  $1, id_modulo = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING *',
      [id_rol, id_modulo]
    );
    return result.rows[0];
  };

  const deleteModuloRol = async (id) => {
    const result = await pool.query('DELETE FROM modulo_rol WHERE id = $1 RETURNING *', [id]);
    return result.rows[0];
  };
  
  module.exports = {
    createModuloRol,
    getModuloRolById,
    getModuloRols,
    updateModuloRol,
    deleteModuloRol
    // Exporta las otras funciones aquí...
  };