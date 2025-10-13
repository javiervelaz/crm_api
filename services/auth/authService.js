const userService = require('../user/userService');
const authDb = require('../../model/auth/db');
const bcrypt = require('bcrypt');

const authenticate = async (email, password) => {
  const user = await userService.authenticate(email, password); // ya trae user básico + roles

  if (user.error) return user;

  // Ahora buscamos módulos
  const modules = await authDb.getUserModules(user.id, user.cliente_id);

  return {
    ...user,
    modules
  };
};

module.exports = { authenticate };
