// db.js
const e = require('express');
const pool = require('../../pool');

const createRolPermiso = async (rolPermiso) => {
    const { id_rol,id_permiso } = rolPermiso;
    const result = await pool.query(
      'INSERT INTO rol_permiso (id_rol,id_permiso) VALUES ($1,$2) RETURNING *',
      [ id_rol,id_permiso]
    );
    return result.rows[0];
  }
  
  const getRolPermisoById = async (id) => {
    const result = await pool.query('SELECT * FROM "rol_permiso" WHERE id = $1', [id]);
    return result.rows[0];
  }
  
  const getRolPermisos = async () => {
    const result = await pool.query('SELECT * FROM "rol_permiso"', []);
    return result.rows;
  }
  
  const updateRolPermiso = async (id, rol) => {
    const { id_rol,id_permiso } = rol;
    const result = await pool.query(
      'UPDATE "rol_permiso" SET  id_rol= $1, id_permiso=$2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING *',
      [id_rol,id_permiso]
    );
    return result.rows[0];
  };

  const deleteRolPermiso = async (id) => {
    const result = await pool.query('DELETE FROM "rol_permiso" WHERE id = $1 RETURNING *', [id]);
    return result.rows[0];
  };
  
  module.exports = {
    createRolPermiso,
    getRolPermisoById,
    getRolPermisos,
    updateRolPermiso,
    deleteRolPermiso
  };