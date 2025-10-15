// db.js
const e = require('express');
const pool = require('../../pool');

const createRolPermiso = async (rolPermiso) => {
    const { id_rol,id_permiso,cliente_id } = rolPermiso;
    const result = await pool.query(
      'INSERT INTO rol_permiso (rol_id,permiso_id,cliente_id) VALUES ($1,$2,$3) RETURNING *',
      [ id_rol,id_permiso,cliente_id]
    );
    return result.rows[0];
  }
  
  const getRolPermisoById = async (id,cliente_id) => {
    const result = await pool.query('SELECT * FROM "rol_permiso" WHERE id = $1 and cliente_id= $2', [id,cliente_id]);
    return result.rows[0];
  }
  
  const getRolPermisos = async (cliente_id) => {
    const result = await pool.query('SELECT * FROM "rol_permiso" where cliente_id =  $1', [cliente_id]);
    return result.rows;
  }
  
  const updateRolPermiso = async (id, rol) => {
    const { id_permiso,cliente_id } = rol;
    const query = `
    UPDATE "rol_permiso" SET   
      permiso_id=COALESCE($1,permiso_id)
      WHERE id = $3 and cliente_id = $2 RETURNING *
    `;
    const result = await pool.query(
      query,
      [id_permiso,cliente_id,id]
    );
    return result.rows[0];
  };

  const deleteRolPermiso = async (id,cliente_id) => {
    const result = await pool.query('DELETE FROM "rol_permiso" WHERE id = $1 and cliente_id  =$2 RETURNING *', [id,cliente_id]);
    return result.rows[0];
  };
  
  module.exports = {
    createRolPermiso,
    getRolPermisoById,
    getRolPermisos,
    updateRolPermiso,
    deleteRolPermiso
  };