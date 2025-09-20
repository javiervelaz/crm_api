// db.js
const e = require('express');
const pool = require('../../pool');

const createEmpleado = async (empleado) => {
  const { id_user, password, legajo, fecha_ingreso, rol_id } = empleado;
  const result = await pool.query(
    'INSERT INTO empleado (id_user, password,legajo,fecha_ingreso,rol_id) VALUES ($1, $2, $3, $4,$5) RETURNING *',
    [id_user, password, legajo, fecha_ingreso,rol_id]
  );
  return result.rows[0];
};

const getEmpleadoById = async (id) => {
  const result = await pool.query('SELECT * FROM empleado WHERE id = $1', [id]);
  return result.rows[0];
};

const getEmpleados = async () => {
  const result = await pool.query('SELECT * FROM empleado', []);
  return result.rows;
}


const updateEmpleado = async (id, empleado) => {
  const { id_user, password,legajo, fecha_ingreso, rol_id } = empleado;
  const result = await pool.query(
    'UPDATE user SET id_user = $1, password = $2, legajo = $3, fehca_ingreso = $4, rol_id= $5 updated_at = CURRENT_TIMESTAMP WHERE id = $6 RETURNING *',
    [id_user, password,legajo, fecha_ingreso, rol_id,id]
  );
  return result.rows[0];
};

const deleteEmpleado = async (id) => {
  const result = await pool.query('DELETE FROM empleado WHERE id = $1 RETURNING *', [id]);
  return result.rows[0];
};

module.exports = {
  createEmpleado,
  getEmpleadoById,
  getEmpleados,
  updateEmpleado,
  deleteEmpleado
};