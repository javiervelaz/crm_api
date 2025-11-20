const ModuloService = require('../services/modulo/moduloService');


const createModulo = async (req, res) => {
  const { codigo,descripcion, status,cliente_id } = req.body;

  try {
    const newModulo = await ModuloService.createModuloService({ codigo,descripcion, status,cliente_id });
    res.status(201).json(newModulo);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const getModuloById = async (req, res) => {
    const { id,cliente_id } = req.params;
    try {
      const Modulo = await ModuloService.getModuloByIdService( id,cliente_id );
        if (!Modulo) {
          return res.status(404).json({ error: 'Modulo not found' });
        }
        res.status(200).json(Modulo);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  };

  const getModuloList = async (req, res) => {
    const { cliente_id } = req.params;
    try {
      const result = await ModuloService.getModuloListService(cliente_id)
      res.status(200).json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };
  
  const updateModulo = async (req, res) => {
    const moduloId = req.params.id;
    const { codigo,descripcion,status,cliente_id } = req.body;
    try {
      const updatedModulo = await ModuloService.updateModuloService(moduloId, {codigo,descripcion,status,cliente_id});
      res.status(200).json(updatedModulo);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  };
  
  const deleteModulo = async (req, res) => {
    const { id,cliente_id } = req.params;
    try {
      const result = await ModuloService.deleteModuloService(id,cliente_id);
      res.status(200).json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };

  const getPermisosByModuloId = async (req, res) => {
    const { cliente_id, id_modulo } = req.params;
  
    try {
      const permisos = await ModuloService.getPermisosByModuloIdService(cliente_id, id_modulo);
      res.status(200).json(permisos);
    } catch (error) {
      console.error('Error en getPermisosByModuloId:', error);
      res.status(500).json({ error: 'Error al obtener los permisos del módulo.' });
    }
  };

module.exports = {
    createModulo,
    getModuloById,
    getModuloList,
    updateModulo,
    deleteModulo,
    getPermisosByModuloId
  };
  