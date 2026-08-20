const e = require('express');
const db = require('../../model/users/db');
const userRoledb  = require("../../model/user_rol/db");
const moduleRol =  require("../../model/modulo_rol/db");
const permisosUser = require("../../model/permisos/db");
const bcrypt = require('bcrypt');


const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};  

/**
 * Arma el objeto de sesión de un usuario: roles, módulos y permisos.
 * Es lo que consume issueToken(). Sin password: el JWT nunca la lleva.
 */
const buildSessionUser = async (user) => {
  const userRole = await userRoledb.getUserRoleByUserId(user.id, user.cliente_id);
  const userModulo = await moduleRol.getUserModuloRolByUserId(user.id, user.cliente_id);
  const result_permissions = await permisosUser.getPermisoByUserId(user.id, user.cliente_id);

  const permissions = {};
  for (const row of result_permissions) {
    if (row.es_global) {
      if (!permissions._global) permissions._global = [];
      permissions._global.push(row.permiso_codigo);
    } else {
      const mod = row.modulo_codigo || '_sin_modulo';
      if (!permissions[mod]) permissions[mod] = [];
      permissions[mod].push(row.permiso_codigo);
    }
  }

  return {
    id: user.id,
    username: user.email,
    name: `${user.nombre}, ${user.apellido}`,
    role: userRole.map((r) => r.descripcion),
    modules: userModulo.map((m) => m.codigo),
    permissions,
    cliente_id: user.cliente_id || null,
    cliente_estado: user.cliente_estado || null,
  };
};

/**
 * Valida credenciales. Devuelve el usuario de sesión o { error }.
 *
 * El estado del cliente viaja en `cliente_estado` pero NO se evalúa acá: el
 * gate vive en authController, y corre DESPUÉS de validar la contraseña. Si se
 * rechazara antes, el login se convierte en un oráculo que confirma qué emails
 * están registrados.
 */
const authenticate = async (email, password) => {
  const user = await db.auth(email);
  if (!user) return { error: 'Invalid credentials' };

  const isPasswordValid = bcrypt.compareSync(password, user.password);
  if (!isPasswordValid) return { error: 'Invalid credentials' };

  return buildSessionUser(user);
};

/**
 * Sesión sin contraseña, por id de usuario. La usa la activación de cuenta:
 * el token del mail ya probó identidad.
 */
const buildSessionById = async (userId) => {
  const user = await db.findForSessionById(userId);
  if (!user) return null;
  return buildSessionUser(user);
};

const createUserService = async (user) => {
    const { nombre, apellido, email,user_type_id,cliente_id } = user;
    // Validación de campos requeridos
    if (!nombre || !apellido ||  !email ) {
      throw new Error('All fields are required');
    }
    // Validación de formato de email
    if (!validateEmail(email)) {
      throw new Error('Invalid email format');
    }
    const newUser = await db.createUser({ nombre, apellido,  email, user_type_id,cliente_id });
    return newUser;
  };

  const getUserByIdService = async (id,cliente_id) => {
    const result = await db.getUserById(id,cliente_id);
    return  result.rows[0];
  }

  const getUserListService = async (cliente_id) => {
    const result = await db.getUsers(cliente_id);
    return result.rows;
  }

  const updateUserService = async (userId,user) => {
    const { nombre, apellido,  email,user_type_id } = user;
    if (!nombre || !apellido ||  !email ) {
      throw new Error('All fields are required');
    }
    // Validación de formato de email
    if (!validateEmail(email)) {
      throw new Error('Invalid email format');
    }
    const updatedUser = await db.updateUser(userId, { nombre, apellido,  email ,user_type_id});
    return updatedUser;
  }

  const deleteUserService = async (id,cliente_id) => {
    const result = await db.deleteUser(id,cliente_id);
    if (!result) {
      return res.status(404).json({ error: 'User not found' });
    }
    return result;
  }

  const getUserTypeByIdService  = async (id) => {
    const result = await db.getUserTypeById(id.id);
    return result.rows[0];
  }

  const getUserTypeListService  = async () => {
    const result = await db.getUserTypeList();
    return result.rows;
  }

  const getUserRolService  = async (id,cliente_id) => {
    const result = await db.getUserRol(id,cliente_id);
    return result.rows;
  }

  const getUserByTelService = async (telefono,cliente_id) => {
    const result = await db.getUserByTel(telefono,cliente_id);
    return result.rows[0];
  }

  const getUserEstadisticaService = async (id,cliente_id) => {
    const result = await db.getEstadisticasCliente(id,cliente_id);

    return result;
  }
  const getUserModulosPermisosService = async (id,cliente_id) => {
    const result = await db.getUserModulosPermisos(id,cliente_id);

    return result;
  }

  const postUserModulosPermisosService = async (id,cliente_id,modulos) => {
    // Validación de campos requeridos
    const result = await db.postUserModulosPermisos(id,cliente_id,modulos );
    return result;
  };
  
  

module.exports = {
    validateEmail,
    createUserService,
    getUserByIdService,
    getUserListService,
    updateUserService,
    deleteUserService,
    authenticate,
    buildSessionUser,
    buildSessionById,
    getUserTypeByIdService,
    getUserRolService,
    getUserByTelService,
    getUserTypeListService,
    getUserEstadisticaService,
    getUserModulosPermisosService,
    postUserModulosPermisosService
};