const UserRolService = require('../services/user_rol/userRolService');


const createUserRol = async (req, res) => {
  const { id_rol, id_user, cliente_id } = req.body;

  try {
    const result = await UserRolService.createUserRolService({ id_rol, id_user, cliente_id });
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const getUserRolById = async (req, res) => {
    const { id, cliente_id } = req.params;
    try {
      const result = await UserRolService.getUserRolByIdService({ id ,cliente_id});
        if (!result) {
          return res.status(404).json({ error: 'Modulo rol not found' });
        }
        res.status(200).json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  };

  const getUserRolList = async (req, res) => {
    const {  cliente_id } = req.params;
    if(!cliente_id) return res.status(404).json( { error: "No se puede filtrar por cliente"});
    try {
      const result = await UserRolService.getUserRolListService(cliente_id);
      res.status(200).json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };
  
  const updateUserRol = async (req, res) => {
    const moduloId = req.params.id;
    const {id_rol, id_user } = req.body;
    try {
      const result = await UserRolService.updateUserRolService(moduloId, {id_rol, id_user});
      res.status(200).json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  };
  
  const deleteUserRol = async (req, res) => {
    const { id,cliente_id } = req.params;
    try {
      const result = await UserRolService.deleteUserRolService(id,cliente_id);
      res.status(200).json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };

  const getUserRoleByUserId = async (req, res) => {
    const { id,cliente_id } = req.params;
    try {
      const result = await UserRolService.getUserRolByUserIdService(id,cliente_id);
        if (!result) {
          return res.status(404).json({ error: 'User Role not found' });
        }
        res.status(200).json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  };


  
module.exports = {
    createUserRol,
    getUserRolById,
    getUserRolList,
    updateUserRol,
    deleteUserRol,
    getUserRoleByUserId
  };
  