// db.js
const e = require('express');
const pool = require('../../pool');

const createPermiso = async (permisos) => {
    const { nombre,descripcion } = permisos;
    const result = await pool.query(
      'INSERT INTO permiso (nombre,descripcion) VALUES ($1,$2) RETURNING *',
      [nombre,descripcion]
    );
    return result.rows[0];
  }
  
  const getPermisoById = async (id,cliente_id) => {
    const result = await pool.query('SELECT * FROM "permiso" WHERE id = $1 and cliente_id = $2', [id,cliente_id]);
    return result.rows[0];
  }
  
  const getPermisos = async (cliente_id) => {
    const result = await pool.query('SELECT * FROM "permiso" where cliente_id = $1', [cliente_id]);
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

  const deletePermiso = async (id,cliente_id) => {
    const result = await pool.query('DELETE FROM "permiso" WHERE id = $1 and cliente_id =$2 RETURNING *', [id,cliente_id]);
    return result.rows;
  };

  const getPermisoByUserId = async (user_id,cliente_id) => {
    const query = `
    SELECT 
      p.codigo AS permiso_codigo,
      m.codigo AS modulo_codigo,
      p.es_global
    FROM user_rol ur
    JOIN rol_permiso rp ON ur.id_rol = rp.rol_id AND ur.cliente_id = rp.cliente_id
    JOIN permiso p ON rp.permiso_id = p.id
    LEFT JOIN modulo m ON p.modulo_id = m.id
    WHERE ur.id_user = $1 AND ur.cliente_id = $2
  `;
  const result = await pool.query(query, [user_id, cliente_id]);
 
  return result.rows;
  }
  
  module.exports = {
    createPermiso,
    getPermisoById,
    getPermisos,
    updatePermiso,
    deletePermiso,
    getPermisoByUserId
  };