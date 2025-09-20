// db.js
const e = require('express');
const pool = require('../../pool');

const createProfile = async (Profile) => {
  const { id_user,dni, telefono, password, legajo, fecha_ingreso, casa_nro, barrio } = Profile;
  const result = await pool.query(
    'INSERT INTO "profile" (id_user, dni, telefono,password,legajo,fecha_ingreso, casa_nro, barrio) VALUES ($1, $2, $3,$4,$5,$6,$7,$8) RETURNING *',
    [id_user,dni, telefono, password, legajo, fecha_ingreso,casa_nro, barrio]
  );
  return result.rows[0];
};

const getByTelefono = async (telefono) => {
  const result= await pool.query('SELECT telefono FROM "profile" WHERE  telefono  = $1', [telefono]);
  return result.rows[0];
}


const getProfileById = async (id) => {
  const result = await pool.query('SELECT * FROM "profile" WHERE id = $1', [id]);
  return result.rows[0];
};

const getProfiles = async () => {
  const result = await pool.query('SELECT * FROM "profile"', []);
  return result.rows;
}


const updateProfile = async (id, Profile) => {
  const { dni, telefono, password, legajo, fecha_ingreso,casa_nro, barrio } = Profile;
  const result = await pool.query(
    'UPDATE "profile" SET  dni = $1, telefono = $2,password = $3, legajo = $4, fecha_ingreso = $5,casa_nro = $6, barrio = $7 ,updated_at = CURRENT_TIMESTAMP WHERE id = $8 RETURNING *',
    [dni, telefono, password, legajo, fecha_ingreso,casa_nro, barrio,id]
  );
  return result.rows[0];
};

const deleteProfile = async (id) => {
  const result = await pool.query('DELETE FROM "profile" WHERE id = $1 RETURNING *', [id]);
  return result.rows[0];
};

const getProfileByUserId = async (id) => {
  const result = await pool.query('SELECT * FROM "profile" WHERE id_user = $1', [id]);
  return result.rows[0];
};

module.exports = {
  createProfile,
  getProfileById,
  getProfiles,
  updateProfile,
  deleteProfile,
  getProfileByUserId,
  getByTelefono
};