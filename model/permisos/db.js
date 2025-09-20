// db.js
const e = require('express');
const pool = require('../../pool');

const createPermiso = async (permisos) => {
    const { nombre,descripcion } = permisos;
    const result = await pool.query(
      'INSERT INTO permisos (nombre,descripcion) VALUES ($1,$2) RETURNING *',
      [nombre,descripcion]
    );
    return result.rows[0];
  }
  
  const getPermisoById = async (id) => {
    const result = await pool.query('SELECT * FROM "permisos" WHERE id = $1', [id]);
    return result.rows[0];
  }
  
  const getPermisos = async () => {
    const result = await pool.query('SELECT * FROM "permisos"', []);
    return result.rows;
  }
  
  const updatePermiso = async (id, rol) => {
    const { nombre,descripcion } = rol;
    const result = await pool.query(
      'UPDATE "permisos" SET  nombre= $1, descripcion=$2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING *',
      [nombre,descripcion]
    );
    return result.rows[0];
  };

  const deletePermiso = async (id) => {
    const result = await pool.query('DELETE FROM "permisos" WHERE id = $1 RETURNING *', [id]);
    return result.rows[0];
  };
  
  module.exports = {
    createPermiso,
    getPermisoById,
    getPermisos,
    updatePermiso,
    deletePermiso
  };