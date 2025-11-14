const ModuloRolService = require('../services/modulo_rol/moduloRolService');


const createModuloRol = async (req, res) => {
  const { id_rol, id_modulo, cliente_id } = req.body;

  try {
    const result = await ModuloRolService.createModuloRolService({ id_rol, id_modulo,cliente_id });
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const getModuloRolById = async (req, res) => {
    const { id,cliente_id } = req.params;
    try {
      const result = await ModuloRolService.getModuloRolByIdService(id ,cliente_id);
        if (!result) {
          return res.status(404).json({ error: 'Modulo rol not found' });
        }
        res.status(200).json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  };

  const getModuloRolList = async (req, res) => {
    const {  cliente_id } = req.params;
    if(!cliente_id) return res.status(404).json( { error: "No se puede filtrar por cliente"});
    try {
      const result = await ModuloRolService.getModuloRolListService(cliente_id);
      res.status(200).json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };
  
  const updateModuloRol = async (req, res) => {
    const moduloId = req.params.id;
    const {id_rol, id_modulo, cliente_id } = req.body;
    try {
      const result = await ModuloRolService.updateModuloRolService(moduloId, {id_rol, id_modulo,cliente_id});
      res.status(200).json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  };
  
  const deleteModuloRol = async (req, res) => {
    const { id , cliente_id} = req.params;
    try {
      const result = await ModuloRolService.deleteModuloRolService(id,cliente_id);
      res.status(200).json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };

  const getUserRolModuloByUserId = async (req, res) => {
    const { user_id, cliente_id } = req.params;
    try {
      const result = await ModuloRolService.getUserRolModuloByUserIdService( user_id, cliente_id );
        if (!result) {
          return res.status(404).json({ error: 'Modulo rol not found' });
        }
        res.status(200).json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  };

  

module.exports = {
    createModuloRol,
    getModuloRolById,
    getModuloRolList,
    updateModuloRol,
    deleteModuloRol,
    getUserRolModuloByUserId
  };
  