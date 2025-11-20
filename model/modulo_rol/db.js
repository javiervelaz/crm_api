// db.js
const e = require('express');
const pool = require('../../pool');

const createModuloRol = async (rol) => {
    const { id_rol, id_modulo, cliente_id } = rol;
    const result = await pool.query(
      'INSERT INTO modulo_rol (id_rol, id_modulo, cliente_id) VALUES ($1,$2,$3) RETURNING *',
      [id_rol, id_modulo,cliente_id]
    );
    return result.rows[0];
  }
  
  const getModuloRolById = async (id,cliente_id) => {
    const result = await pool.query('SELECT * FROM modulo_rol WHERE id = $1 and cliente_id= $2', [id,cliente_id]);
    return result.rows[0];
  }
  
  const getModuloRols = async (cliente_id) => {
    const result = await pool.query('SELECT * FROM modulo_rol where cliente_id = $1', [cliente_id]);
    return result.rows;
  }
  
  const updateModuloRol = async (id, rol) => {
    const { id_rol, id_modulo,cliente_id } = rol;
    const result = await pool.query(
      `UPDATE modulo_rol 
      SET id_rol =  COALESCE($1,id_rol), 
          id_modulo = COALESCE($2,id_modulo) 
      WHERE id = $3 and cliente_id = $4 RETURNING *`,
      [id_rol, id_modulo,id,cliente_id]
    );
    return result.rows[0];
  };

  const deleteModuloRol = async (id,cliente_id) => {
    const result = await pool.query('DELETE FROM modulo_rol WHERE id = $1 and cliente_id = $2 RETURNING *', [id,cliente_id]);
    return result.rows[0];
  };

  const getUserModuloRolByUserId = async (user_id, cliente_id) => {
    const result = await pool.query(`
      SELECT m.codigo
      FROM "user_rol" ur
      join "modulo_rol" mr  on mr.id_rol = ur.id_rol
      join "modulo" m on m.id = mr.id_modulo
      WHERE ur.id_user= $1 and m.cliente_id =  $2
      ;
      `, [user_id,cliente_id]);
    return result.rows;
  }
  
  
  module.exports = {
    createModuloRol,
    getModuloRolById,
    getModuloRols,
    updateModuloRol,
    deleteModuloRol,
    getUserModuloRolByUserId
    // Exporta las otras funciones aquí...
  };