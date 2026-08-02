// db.js
const e = require('express');
const pool = require('./pool');

const createUser = async (user) => {
  const { nombre, apellido, dni, email } = user;
  const result = await pool.query(
    'INSERT INTO user (nombre, apellido, dni, email) VALUES ($1, $2, $3, $4) RETURNING *',
    [nombre, apellido, dni, email]
  );
  return result.rows[0];
};

const getUserById = async (id) => {
  const result = await pool.query('SELECT * FROM "user" WHERE id = $1', [id]);
  return result.rows[0];
};

const getUsers = async () => {
  const result = await pool.query('SELECT * FROM user', []);
  return result.rows;
}


const updateUser = async (id, user) => {
  const { nombre, apellido, dni, email } = user;
  const result = await pool.query(
    'UPDATE user SET nombre = $1, apellido = $2, dni = $3, email = $4, updated_at = CURRENT_TIMESTAMP WHERE id = $5 RETURNING *',
    [nombre, apellido, dni, email, id]
  );
  return result.rows[0];
};

const deleteUser = async (id) => {
  const result = await pool.query('DELETE FROM user WHERE id = $1 RETURNING *', [id]);
  return result.rows[0];
};

const createRol = async (rol) => {
  const { descripcion } = rol;
  const result = await pool.query(
    'INSERT INTO rol (descripcion) VALUES ($1) RETURNING *',
    [descripcion]
  );
  return result.rows[0];
}

const getRolById = async (id) => {
  const result = await pool.query('SELECT * FROM rol WHERE id = $1', [id]);
  return result.rows[0];
}

const getRols = async () => {
  const result = await pool.query('SELECT * FROM rol', []);
  return result.rows;
}

const updateRol = async (id, rol) => {
  const { descripcion } = rol;
  const result = await pool.query(
    'UPDATE user SET descripcion = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
    [nombre, apellido, dni, email, id]
  );
  return result.rows[0];
};

module.exports = {
  createUser,
  getUserById,
  getUsers,
  updateUser,
  deleteUser,
  createRol,
  getRolById,
  getRols,
  updateRol
  // Exporta las otras funciones aquí...
};
