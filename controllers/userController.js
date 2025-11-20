
const userService = require('../services/user/userService');


const createUser = async (req, res) => {
  const { nombre, apellido, email ,user_type_id , cliente_id} = req.body;

  try {
    const newUser = await userService.createUserService({  nombre, apellido, email ,user_type_id ,cliente_id });
    res.status(201).json(newUser);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const getUserById = async (req, res) => {
  const { id,cliente_id } = req.params;
  try {
    const user = await userService.getUserByIdService(id,cliente_id);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};


const getUsers = async (req, res) => {
  const {  cliente_id } = req.params;
  if(!cliente_id) return res.status(404).json( { error: "No se puede filtrar por cliente"});
  try {
    const result = await userService.getUserListService(cliente_id);
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const updateUser = async (req, res) => {
  const userId = req.params.id;
  const { nombre, apellido, email ,user_type_id  } = req.body;
  try {
    const updatedUser = await userService.updateUserService(userId, {  nombre, apellido, email ,user_type_id  });
    res.status(200).json(updatedUser);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const deleteUser = async (req, res) => {
  const {  cliente_id } = req.params;
  if(!cliente_id) return res.status(404).json( { error: "No se puede filtrar por cliente"});
  const { id } = req.params;
  try {
    const result = await userService.deleteUserService(id,cliente_id);
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getUserTypeById  = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await userService.getUserTypeByIdService({ id });
      if (!result) {
        return res.status(404).json({ error: 'user type rol not found' });
      }
      res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getUserTypeList = async (req, res) => {

  try {
    const result = await userService.getUserTypeListService();
      if (!result) {
        return res.status(404).json({ error: 'user type rol not found' });
      }
      res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getUserRol  = async (req, res) => {
  const { id ,cliente_id} = req.params;
  try {
    const result = await userService.getUserRolService(id,cliente_id);
      if (!result) {
        return res.status(404).json({ error: 'user  rol not found' });
      }
      res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getUserByTel = async (req, res) => {
  const { telefono,cliente_id } = req.params;
  try {
    const result = await userService.getUserByTelService(telefono,cliente_id);
    if (!result || result.length === 0) {
      return res.status(404).json({ error: 'Telefono  rol not found' });
    }
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

const getUserEstadistica = async (req, res) => {
  const { id, cliente_id } = req.params;
  try {
    const result = await userService.getUserEstadisticaService(id,cliente_id);
    if (!result || result.length === 0) {
      return res.status(404).json({ error: 'cliente  not found' });
    }
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

const getUserModulosPermisos = async (req, res) => {
  const { id, cliente_id } = req.params;
  try {
    const result = await userService.getUserModulosPermisosService(id,cliente_id);
    if (!result || result.length === 0) {
      return res.status(404).json({ error: 'user modulo permisos  not found' });
    }
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

const postUserModulosPermisos = async (req, res) => {
  
  const  modulos  = req.body;
  const { id, cliente_id } = req.params;
  try {
    const data = await userService.postUserModulosPermisosService(  id ,cliente_id, modulos );
    res.status(201).json(data);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};




module.exports = {
  createUser,
  getUserById,
  getUsers,
  updateUser,
  deleteUser,
  getUserTypeById,
  getUserRol,
  getUserByTel,
  getUserTypeList,
  getUserEstadistica,
  getUserModulosPermisos,
  postUserModulosPermisos
};

