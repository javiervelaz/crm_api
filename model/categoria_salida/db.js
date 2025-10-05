// db.js
const e = require('express');
const pool = require('../../pool');

const createCategoria = async (categoria_salida) => {
  const { nombre, categoria_tipo_id, cliente_id } = categoria_salida;
  const result = await pool.query(
    'INSERT INTO "categoria_salida" (nombre, categoria_tipo_id,cliente_id) VALUES ($1, $2,$3) RETURNING *',
    [nombre, categoria_tipo_id,cliente_id]
  );
  return result.rows[0];
};

const getCategoriaById = async (id, cliente_id) => {
  const result = await pool.query('SELECT * FROM "categoria_salida" WHERE id = $1 and cliente_id = $2', [id,cliente_id]);
  return result;
};


const getCategorias = async (cliente_id) => {
  const result = await pool.query('SELECT cs.id,cs.nombre,cs.categoria_tipo_id,ct.descripcion, cs.cliente_id FROM "categoria_salida" cs join "categoria_tipo" ct on cs.categoria_tipo_id = ct.id where cs.cliente_id = $1', [cliente_id]);
  return result;
}


const updateCategoria = async (id, categoria_salida) => {
  const { nombre, categoria_tipo_id, cliente_id } = categoria_salida;
  const result = await pool.query(
    'UPDATE "categoria_salida" SET nombre = $1, categoria_tipo_id = $2 WHERE cliente_id = $3  and  id = $4 RETURNING *',
    [nombre, categoria_tipo_id, cliente_id, id]
  );
  return result.rows[0];
};

const deleteCategoria = async (id, cliente_id) => {
  const result = await pool.query('DELETE FROM "categoria_salida" WHERE id = $1 and cliente_id  =  $2 RETURNING *', [id, cliente_id]);
  return result.rows[0];
};


module.exports = {
    createCategoria,
    getCategoriaById,
    getCategorias,
    updateCategoria,
    deleteCategoria
  };