const db = require('../../model/profile/db');
const bcrypt = require('bcrypt');

// Nunca devolver el hash de la contraseña al cliente.
const stripPassword = (row) => {
  if (!row || typeof row !== 'object') return row;
  const { password, ...rest } = row;
  return rest;
};
const stripPasswordList = (rows) => Array.isArray(rows) ? rows.map(stripPassword) : rows;

// ¿El valor ya es un hash bcrypt? (evita re-hashear un hash que el front
// pudiera reenviar por error -> el "doble hash" que rompía el login).
const looksHashed = (v) => typeof v === 'string' && /^\$2[aby]\$/.test(v);

const createProfileService = async (data) => {
  const { id_user, dni, telefono, password, legajo, fecha_ingreso, cliente_id } = data;
  if (!id_user || !password || !legajo || !telefono) {
    throw new Error('All fields are required');
  }
  const encrypPass = bcrypt.hashSync(password, 10);
  const formattedFechaIngreso = new Date(fecha_ingreso).toISOString().split('T')[0];
  const result = await db.createProfile({
    id_user, dni, telefono, password: encrypPass, legajo,
    fecha_ingreso: formattedFechaIngreso, cliente_id,
  });
  return stripPassword(result);
};

const getProfileByIdService = async (id, cliente_id) => {
  const result = await db.getProfileById(id, cliente_id);
  return stripPassword(result);
};

const getProfileByUserIdService = async (id, cliente_id) => {
  const result = await db.getProfileByUserId(id, cliente_id);
  return stripPassword(result);
};

const getProfileListService = async (cliente_id) => {
  const result = await db.getProfiles(cliente_id);
  return stripPasswordList(result);
};

const updateProfileService = async (profileId, data) => {
  let formattedFechaIngreso = null;
  const { dni, telefono, password, legajo, fecha_ingreso, cliente_id } = data;
  if (fecha_ingreso != null) {
    formattedFechaIngreso = new Date(fecha_ingreso).toISOString().split('T')[0];
  }

  // Sólo tocar la contraseña si llega una nueva de verdad. Vacío / null /
  // un hash reenviado -> null, y el COALESCE del modelo conserva la actual.
  let passwordToSave = null;
  if (typeof password === 'string' && password.trim() !== '' && !looksHashed(password)) {
    passwordToSave = bcrypt.hashSync(password, 10);
  }

  const result = await db.updateProfile(profileId, {
    dni, telefono, password: passwordToSave, legajo,
    fecha_ingreso: formattedFechaIngreso, cliente_id,
  });
  return stripPassword(result);
};

const deleteProfileService = async (id, cliente_id) => {
  const result = await db.deleteProfile(id, cliente_id);
  return stripPassword(result);
};

module.exports = {
  createProfileService,
  getProfileByIdService,
  getProfileListService,
  updateProfileService,
  deleteProfileService,
  getProfileByUserIdService,
};
