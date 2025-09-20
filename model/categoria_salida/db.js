// db.js
const e = require('express');
const pool = require('../../pool');

const createCategoria = async (categoria_salida) => {
  const { nombre, categoria_tipo_id } = categoria_salida;
  const result = await pool.query(
    'INSERT INTO "categoria_salida" (nombre, categoria_tipo_id) VALUES ($1, $2) RETURNING *',
    [nombre, categoria_tipo_id]
  );
  return result.rows[0];
};

const getCategoriaById = async (id) => {
  const result = await pool.query('SELECT * FROM "categoria_salida" WHERE id = $1', [id]);
  return result;
};


const getCategorias = async () => {
  const result = await pool.query('SELECT cs.id,cs.nombre,cs.categoria_tipo_id,ct.descripcion FROM "categoria_salida" cs join "categoria_tipo" ct on cs.categoria_tipo_id = ct.id ', []);
  return result;
}


const updateCategoria = async (id, categoria_salida) => {
  const { nombre, categoria_tipo_id } = categoria_salida;
  const result = await pool.query(
    'UPDATE "categoria_salida" SET nombre = $1, categoria_tipo_id = $2 WHERE id = $3 RETURNING *',
    [nombre, categoria_tipo_id, id]
  );
  return result.rows[0];
};

const deleteCategoria = async (id) => {
  const result = await pool.query('DELETE FROM "categoria_salida" WHERE id = $1 RETURNING *', [id]);
  return result.rows[0];
};


module.exports = {
    createCategoria,
    getCategoriaById,
    getCategorias,
    updateCategoria,
    deleteCategoria
  };