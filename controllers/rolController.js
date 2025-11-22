const rolService = require('../services/rol/rolService');


const createRol = async (req, res) => {
  const { descripcion,cliente_id } = req.body;

  try {
    const newRol = await rolService.createRolService({ descripcion,cliente_id });
    res.status(201).json(newRol);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const getRolById = async (req, res) => {
    const { id,cliente_id } = req.params;
    try {
      const rol = await rolService.getRolByIdService( id ,cliente_id);
        if (!rol) {
          return res.status(404).json({ error: 'Rol not found' });
        }
        res.status(200).json(rol);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  };

  const getRolList = async (req, res) => {
    const { cliente_id } = req.params;
    try {
      const result = await rolService.getRolListService(cliente_id)
      res.status(200).json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };
  
  const updateRol = async (req, res) => {
    const rooId = req.params.id;
    const { descripcion,cliente_id } = req.body;
    try {
      const updatedRol = await rolService.updateRolService(rooId, {descripcion,cliente_id});
      res.status(200).json(updatedRol);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  };
  
  const deleteRol = async (req, res) => {
    const { id,cliente_id} = req.params;
    try {
      const result = await rolService.deleteRolService(id,cliente_id);
      res.status(200).json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };

  const getRolModulosPermisos = async (req, res) => {
    const { rol_id, cliente_id } = req.params;
    try {
      const data = await rolService.getRolModulosPermisosService(Number(rol_id), Number(cliente_id));
      res.status(200).json(data);
    } catch (error) {
      console.error('Error en getRolModulosPermisos:', error);
      res.status(500).json({ error: 'Error al obtener módulos/permiso del rol' });
    }
  };

  const postRolModulosPermisos = async (req, res) => {
    const { rol_id, cliente_id } = req.params;
    const payload = req.body; // esperado: [{ modulo_id, permisos: [id_permiso,...] }, ...]
    try {
      const result = await rolService.postRolModulosPermisosService(Number(rol_id), Number(cliente_id), payload);
      res.status(200).json({ ok: true, message: 'Módulos y permisos guardados', result });
    } catch (error) {
      console.error('Error en postRolModulosPermisos:', error);
      res.status(500).json({ error: error.message || 'Error al guardar módulos/permiso del rol' });
    }
  };
  
  

module.exports = {
    createRol,
    getRolById,
    getRolList,
    updateRol,
    deleteRol,
    getRolModulosPermisos,
    postRolModulosPermisos
  };
  