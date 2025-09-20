// db.js
const e = require('express');
const pool = require('../../pool');

const createCategoriaTipo = async (data) => {
  const { descripcion } = data;
  const result = await pool.query(
    'INSERT INTO "categoria_tipo" (descripcion) VALUES ($1) RETURNING *',
    [descripcion]
  );
  return result.rows[0];
};

const getCategoriaTipoById = async (id) => {
  const result = await pool.query('SELECT * FROM "categoria_tipo" WHERE id = $1', [id]);
  return result;
};


const getCategoriaTipo = async () => {
  const result = await pool.query('SELECT *  from "categoria_tipo" ', []);
  return result;
}


const updateCategoriaTipo = async (id, data) => {
  const { descripcion } = data;
  const result = await pool.query(
    'UPDATE "categoria_tipo" SET descripcion = $1 WHERE id = $2 RETURNING *',
    [ descripcion, id]
  );
  return result.rows[0];
};

const deleteCategoriaTipo = async (id) => {
  const result = await pool.query('DELETE FROM "categoria_tipo" WHERE id = $1 RETURNING *', [id]);
  return result.rows[0];
};


module.exports = {
    createCategoriaTipo,
    getCategoriaTipoById,
    getCategoriaTipo,
    updateCategoriaTipo,
    deleteCategoriaTipo
  };