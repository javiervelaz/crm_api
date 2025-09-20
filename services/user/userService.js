const e = require('express');
const db = require('../../model/users/db');
const userRoledb  = require("../../model/user_rol/db");
const { emit } = require('../../node');
const bcrypt = require('bcrypt');


const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};  

const authenticate = async (email, password) => {
    const user = await db.auth(email);
    if(user){
      //const authConfig = JSON.parse(process.env.AUTH);
      const userRole =  await userRoledb.getUserRoleByUserId(user.id);
      const userData = 
          {
              id: user.id,
              username: user.email,
              name : user.nombre + ", " + user.apellido,
              password: bcrypt.hashSync(user.password, 8),
              role: userRole
          };
      if (!userData) {
        return { error: 'Invalid username' };
      }
      const isPasswordValid = await bcrypt.compareSync(password, user.password);  
      if (isPasswordValid) {
        return userData;
      } else {
        return { error: 'Invalid credentials' };
      }
    }else{
      return { error: 'Invalid credentials' };
    }
    
};

const createUserService = async (user) => {
    const { nombre, apellido, email,user_type_id } = user;
    // Validación de campos requeridos
    if (!nombre || !apellido ||  !email ) {
      throw new Error('All fields are required');
    }
    // Validación de formato de email
    if (!validateEmail(email)) {
      throw new Error('Invalid email format');
    }
    const newUser = await db.createUser({ nombre, apellido,  email, user_type_id });
    return newUser;
  };

  const getUserByIdService = async (id) => {
    const result = await db.getUserById(id);
    return  result.rows[0];
  }

  const getUserListService = async () => {
    const result = await db.getUsers();
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

  const deleteUserService = async (id) => {
    const result = await db.deleteUser(id);
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

  const getUserRolService  = async (id) => {
    const result = await db.getUserRol(id);
    return result.rows;
  }

  const getUserByTelService = async (telefono) => {
    const result = await db.getUserByTel(telefono);
    return result.rows[0];
  }

  const getUserEstadisticaService = async (id) => {
    const result = await db.getEstadisticasCliente(id);

    return result;
  }
  

module.exports = {
    validateEmail,
    createUserService,
    getUserByIdService,
    getUserListService,
    updateUserService,
    deleteUserService,
    authenticate,
    getUserTypeByIdService,
    getUserRolService,
    getUserByTelService,
    getUserTypeListService,
    getUserEstadisticaService
};