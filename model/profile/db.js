// db.js
const e = require('express');
const pool = require('../../pool');

const createProfile = async (Profile) => {
  const { id_user,dni, telefono, password, legajo, fecha_ingreso, casa_nro, barrio ,cliente_id } = Profile;
  const result = await pool.query(
    'INSERT INTO "profile" (id_user, dni, telefono,password,legajo,fecha_ingreso, casa_nro, barrio,cliente_id) VALUES ($1, $2, $3,$4,$5,$6,$7,$8, $9) RETURNING *',
    [id_user,dni, telefono, password, legajo, fecha_ingreso,casa_nro, barrio,cliente_id ]
  );
  return result.rows[0];
};

const getByTelefono = async (telefono,cliente_id) => {
  const result= await pool.query('SELECT telefono FROM "profile" WHERE  telefono  = $1 and cliente_id= $2', [telefono,cliente_id]);
  return result.rows[0];
}


const getProfileById = async (id, cliente_id) => {
  const result = await pool.query('SELECT * FROM "profile" WHERE id = $1 and cliente_id = $2', [id,cliente_id]);
  return result.rows[0];
};

const getProfiles = async (cliente_id) => {
  const result = await pool.query('SELECT * FROM "profile" where cliente_id= $1', [cliente_id]);
  
  return result.rows;
}


const updateProfile = async (id, Profile) => {
  const {
    dni= null, 
    telefono= null, 
    password= null, 
    legajo= null, 
    fecha_ingreso= null,
    casa_nro= null, 
    barrio= null,
    cliente_id
  } = Profile;

  // Validaciones mínimas
  if (!id) throw new Error('Falta id');
  if (!cliente_id) throw new Error('Falta cliente_id');

  const { rows, rowCount } = await pool.query(
    `
    UPDATE "profile"
    SET
      dni       = COALESCE($1::integer, dni),
      telefono = COALESCE($2, telefono),
      password= COALESCE($3, password),
      legajo= COALESCE($4, legajo),
      fecha_ingreso   = COALESCE($5, fecha_ingreso),
      casa_nro = COALESCE($6, casa_nro),
      barrio = COALESCE($7, casa_nro),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $9 AND cliente_id = $8
    RETURNING *;
    `,
    [
      // Mapear undefined -> null para que COALESCE funcione
      dni ?? null,
      telefono ?? null,
      password ?? null,
      legajo ?? null,
      fecha_ingreso ?? null,
      casa_nro ?? null,
      barrio ?? null,
      cliente_id,
      id,
    ]
  );

  if (rowCount === 0) throw new Error('Profile no encontrado');
  return rows[0];

};

const deleteProfile = async (id,cliente_id) => {
  const result = await pool.query('DELETE FROM "profile" WHERE id = $1 and cliente_id = $2 RETURNING *', [id,cliente_id]);
  return result.rows[0];
};

const getProfileByUserId = async (id,cliente_id) => {
  console.log("user id" ,id)
  console.log("client id",cliente_id)
  const result = await pool.query('SELECT * FROM "profile" WHERE "id_user" = $1 and "cliente_id" = $2', [id,cliente_id]);
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