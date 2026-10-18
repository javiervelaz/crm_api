const db = require('../../model/profile/db');
const legajoDb = require('../../model/profile/legajo');
const userRolDb = require('../../model/user_rol/db');

class ProfileError extends Error {
  constructor(message, status = 400, code = 'PROFILE_INVALIDO') {
    super(message);
    this.status = status;
    this.code = code;
  }
}
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

// El legajo lo asigna la API (autonumérico por tenant); el que venga en el
// body se ignora.
const createProfileService = async (data) => {
  const { id_user, dni, telefono, password, fecha_ingreso, cliente_id } = data;
  if (!id_user || !password || !telefono) {
    throw new ProfileError('All fields are required');
  }
  if (!(await userRolDb.userDelTenant(id_user, cliente_id))) {
    throw new ProfileError('Usuario no encontrado', 404, 'USER_NOT_FOUND');
  }
  const encrypPass = bcrypt.hashSync(password, 10);
  const formattedFechaIngreso = new Date(fecha_ingreso).toISOString().split('T')[0];
  const legajo = await legajoDb.siguienteLegajo(cliente_id);
  const result = await db.createProfile({
    id_user, dni, telefono, password: encrypPass, legajo,
    fecha_ingreso: formattedFechaIngreso, cliente_id,
  });
  return stripPassword(result);
};

const getProximoLegajoService = async (cliente_id) => ({ legajo: await legajoDb.proximoLegajo(cliente_id) });

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
  // legajo no se edita: lo asigna la API en el alta.
  const { dni, telefono, password, fecha_ingreso, cliente_id } = data;
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
    dni, telefono, password: passwordToSave,
    fecha_ingreso: formattedFechaIngreso, cliente_id,
  });
  return stripPassword(result);
};

const deleteProfileService = async (id, cliente_id) => {
  const result = await db.deleteProfile(id, cliente_id);
  return stripPassword(result);
};

module.exports = {
  ProfileError,
  createProfileService,
  getProximoLegajoService,
  getProfileByIdService,
  getProfileListService,
  updateProfileService,
  deleteProfileService,
  getProfileByUserIdService,
};
