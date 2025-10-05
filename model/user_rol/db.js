// db.js
const e = require('express');
const pool = require('../../pool');

const createUserRol = async (rol) => {
    const { id_rol, id_user ,cliente_id} = rol;
    const result = await pool.query(
      'INSERT INTO "user_rol" (id_rol, id_user, cliente_id) VALUES ($1,$2,$3) RETURNING *',
      [id_rol, id_user,cliente_id]
    );
    return result.rows[0];
  }
  
  const getUserRolById = async (id,cliente_id) => {
    const result = await pool.query('SELECT * FROM "user_rol" WHERE id = $1 and cliente_id = $2', [id,cliente_id]);
    return result.rows[0];
  }
  
  const getUserRols = async (cliente_id) => {
    const result = await pool.query('SELECT * FROM "user_rol" where cliente_id =$1 ', [cliente_id]);
    return result;
  }
  
  const updateUserRol = async (id, rol) => {
    const { id_rol, id_user } = rol;
    const result = await pool.query(
      'UPDATE "user_rol" SET id_rol =  $1, id_user = $2 WHERE id = $3 RETURNING *',
      [id_rol, id_user,id]
    );
    return result.rows[0];
  };

  const deleteUserRol = async (id,cliente_id) => {
    const result = await pool.query('DELETE FROM "user_rol" WHERE id = $1 and cliente_id = $2RETURNING *', [id,cliente_id]);
    return result.rows[0];
  };

  const getUserRoleByUserId = async (id,cliente_id) => {
    const result = await pool.query('SELECT * FROM "user_rol" WHERE id_user = $1 and  cliente_id =  $2 order by "id_rol" ', [id,cliente_id]);
    return result.rows;
  };
  
  module.exports = {
    createUserRol,
    getUserRolById,
    getUserRols,
    updateUserRol,
    deleteUserRol,
    getUserRoleByUserId
    // Exporta las otras funciones aquí...
  };