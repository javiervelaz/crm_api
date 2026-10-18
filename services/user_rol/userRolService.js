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

// Profesores, tutores y alumnos se gestionan desde Academia: acá no se les
// asigna, cambia ni quita rol, y un rol externo no se asigna a nadie. Así no
// quedan usuarios externos sin ficha ni externos con rol de staff (un profesor
// con rol admin pasaba a tener permisos de administración).
const MSG_ROL_EXTERNO = 'Los roles de profesor, tutor y alumno se asignan desde Academia';
const MSG_USER_EXTERNO = 'Este usuario es de la academia (profesor, tutor o alumno): se gestiona desde Academia';
const noExterno = async ({ id_rol = null, id_user = null }, cliente_id) => {
  if (id_rol && (await tipoDb.rolEsExterno(id_rol, cliente_id))) {
    throw new UserRolError(MSG_ROL_EXTERNO, 400, 'ROL_EXTERNO');
  }
  if (id_user && (await tipoDb.userEsExterno(id_user, cliente_id))) {
    throw new UserRolError(MSG_USER_EXTERNO, 400, 'USUARIO_EXTERNO');
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
  await noExterno({ id_rol, id_user }, cliente_id);
  // Idempotente: el rol ya asignado no se duplica.
  const result = (await db.userRolExistente(id_user, id_rol, cliente_id))
    || (await db.createUserRol({ id_rol, id_user, cliente_id }));
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
  const actual = await db.getUserRolById(id, cliente_id);
  if (!actual) throw new UserRolError('User rol not found', 404, 'NOT_FOUND');
  await noExterno({ id_rol: actual.id_rol }, cliente_id);
  await noExterno({ id_rol, id_user: actual.id_user }, cliente_id);
  const result = await db.updateUserRol(id, { id_rol, cliente_id });
  if (!result) throw new UserRolError('User rol not found', 404, 'NOT_FOUND');
  await tipoDb.sincronizarTipo(result.id_user, cliente_id);
  return result;
};

const deleteUserRolService = async (id, cliente_id) => {
  // Se puede limpiar un rol de staff mal asignado, pero no quitar el rol
  // externo (rompería el acceso que maneja Academia).
  const actual = await db.getUserRolById(id, cliente_id);
  if (actual) await noExterno({ id_rol: actual.id_rol }, cliente_id);
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
