// db.js
const e = require('express');
const pool = require('../../pool');

const createRol = async (rol) => {
    const { descripcion,cliente_id } = rol;
    const result = await pool.query(
      'INSERT INTO rol (descripcion,cliente_id) VALUES ($1,$2) RETURNING *',
      [descripcion,cliente_id]
    );
    return result.rows[0];
  }
  
  const getRolById = async (id,cliente_id) => {
    const result = await pool.query('SELECT * FROM "rol" WHERE id = $1 and cliente_id = $2', [id,cliente_id]);
    return result.rows[0];
  }
  
  const getRols = async (cliente_id) => {
    const result = await pool.query('SELECT * FROM "rol" where cliente_id = $1', [cliente_id]);
    return result;
  }
  
  const updateRol = async (id, rol) => {
    const { descripcion,cliente_id } = rol;
    const result = await pool.query(
      'UPDATE "rol" SET descripcion = COALESCE($1,descripcion) WHERE id = $3 and cliente_id =$2 RETURNING *',
      [descripcion,cliente_id,id]
    );
    return result.rows[0];
  };

  const countUsersWithRole = async (id, cliente_id) => {
    const r = await pool.query(
      'SELECT COUNT(*)::int AS n FROM "user_rol" WHERE id_rol = $1 AND cliente_id = $2',
      [id, cliente_id]
    );
    return r.rows[0] ? r.rows[0].n : 0;
  };

  const deleteRol = async (id,cliente_id) => {
    const result = await pool.query('DELETE FROM "rol" WHERE id = $1 and cliente_id =$2 RETURNING *', [id,cliente_id]);
    return result.rows[0];
  };
  
  module.exports = {
    createRol,
    getRolById,
    getRols,
    updateRol,
    deleteRol,
    countUsersWithRole
    // Exporta las otras funciones aquí...
  };