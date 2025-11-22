const ModuloService = require('../services/cliente/clienteService');


const createCliente = async (req, res) => {
  const { nombre,cuit,adminNombre,adminApellido,adminEmail,adminDni } = req.body;

  try {
    const result = await ModuloService.createClienteService({ nombre,cuit,adminNombre,adminApellido,adminEmail,adminDni });
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const getClienteById = async (req, res) => {
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

  const getClienteList = async (req, res) => {
    const { cliente_id } = req.params;
    try {
      const result = await ModuloService.getModuloListService(cliente_id)
      res.status(200).json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };
  
  const updateCliente = async (req, res) => {
    const moduloId = req.params.id;
    const { codigo,descripcion,status,cliente_id } = req.body;
    try {
      const updatedModulo = await ModuloService.updateModuloService(moduloId, {codigo,descripcion,status,cliente_id});
      res.status(200).json(updatedModulo);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  };
  
  const deleteCliente = async (req, res) => {
    const { id,cliente_id } = req.params;
    try {
      const result = await ModuloService.deleteModuloService(id,cliente_id);
      res.status(200).json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };



module.exports = {
    createCliente,
    getClienteById,
    getClienteList,
    updateCliente,
    deleteCliente,
  };
  