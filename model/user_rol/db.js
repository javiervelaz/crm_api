// db.js
const e = require('express');
const pool = require('../../pool');

const createUserRol = async (rol) => {
    const { id_rol, id_user } = rol;
    const result = await pool.query(
      'INSERT INTO "user_rol" (id_rol, id_user) VALUES ($1,$2) RETURNING *',
      [id_rol, id_user]
    );
    return result.rows[0];
  }
  
  const getUserRolById = async (id) => {
    const result = await pool.query('SELECT * FROM "user_rol" WHERE id = $1', [id]);
    return result.rows[0];
  }
  
  const getUserRols = async () => {
    const result = await pool.query('SELECT * FROM "user_rol"', []);
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

  const deleteUserRol = async (id) => {
    const result = await pool.query('DELETE FROM "user_rol" WHERE id = $1 RETURNING *', [id]);
    return result.rows[0];
  };

  const getUserRoleByUserId = async (id) => {
    const result = await pool.query('SELECT * FROM "user_rol" WHERE id_user = $1 order by "id_rol" ', [id]);
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