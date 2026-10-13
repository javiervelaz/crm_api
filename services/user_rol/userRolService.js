const db = require('../../model/user_rol/db');
const tipoDb = require('../../model/users/tipo');

class UserRolError extends Error {
  constructor(message, status = 400, code = 'USER_ROL_INVALIDO') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const parseId = (v) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

const validarRol = async (id_rol, cliente_id) => {
  if (!(await db.rolDelTenant(id_rol, cliente_id))) {
    throw new UserRolError('Rol no encontrado', 404, 'ROL_NOT_FOUND');
  }
};

// Cada alta, cambio o baja de rol recalcula el tipo del usuario
// (model/users/tipo.js): el tipo ya no se elige a mano.
const createUserRolService = async (userRol) => {
  const { cliente_id } = userRol;
  const id_rol = parseId(userRol.id_rol);
  const id_user = parseId(userRol.id_user);
  if (!id_rol || !id_user) {
    throw new UserRolError('All fields are required');
  }
  await validarRol(id_rol, cliente_id);
  if (!(await db.userDelTenant(id_user, cliente_id))) {
    throw new UserRolError('Usuario no encontrado', 404, 'USER_NOT_FOUND');
  }
  const result = await db.createUserRol({ id_rol, id_user, cliente_id });
  await tipoDb.sincronizarTipo(id_user, cliente_id);
  return result;
};

const getUserRolByIdService = async (id, cliente_id) => {
  const result = await db.getUserRolById(id, cliente_id);
  return result;
};

const getUserRolListService = async (cliente_id) => {
  const result = await db.getUserRols(cliente_id);
  return result.rows;
};

const updateUserRolService = async (id, data) => {
  const { cliente_id } = data;
  const id_rol = parseId(data.id_rol);
  if (!id_rol) {
    throw new UserRolError('All fields are required');
  }
  await validarRol(id_rol, cliente_id);
  const result = await db.updateUserRol(id, { id_rol, cliente_id });
  if (!result) throw new UserRolError('User rol not found', 404, 'NOT_FOUND');
  await tipoDb.sincronizarTipo(result.id_user, cliente_id);
  return result;
};

const deleteUserRolService = async (id, cliente_id) => {
  const result = await db.deleteUserRol(id, cliente_id);
  if (!result) {
    throw new UserRolError('User rol not found', 404, 'NOT_FOUND');
  }
  await tipoDb.sincronizarTipo(result.id_user, cliente_id);
  return result;
};

const getUserRolByUserIdService = async (id, cliente_id) => {
  const result = await db.getUserRoleByUserId(id, cliente_id);
  return result;
};

module.exports = {
  UserRolError,
  createUserRolService,
  getUserRolByIdService,
  getUserRolListService,
  updateUserRolService,
  deleteUserRolService,
  getUserRolByUserIdService,
};
