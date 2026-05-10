const ClienteService = require('../services/cliente/clienteService');


const createCliente = async (req, res) => {
  const {
    nombre,
    cuit,
    adminNombre,
    adminApellido,
    adminEmail,
    adminDni,
    plan,           // FREE / BASIC / PREMIUM
    telefono,       // tel de contacto
    adminPassword,  // password del usuario admin
    canal_alta,     // landing, whatsapp, etc. (opcional)
  } = req.body;

  try {
    const result = await ClienteService.createClienteService({
      nombre,
      cuit,
      adminNombre,
      adminApellido,
      adminEmail,
      adminDni,
      plan,
      telefono,
      adminPassword,
      canal_alta,
    });
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};


const getClienteById = async (req, res) => {
    const { id,cliente_id } = req.params;
    try {
      const cliente = await ClienteService.getClienteByIdService( id,cliente_id );
        if (!cliente) {
          return res.status(404).json({ error: 'Cliente not found' });
        }
        res.status(200).json(cliente);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  };

  const getClienteList = async (req, res) => {
    const { cliente_id } = req.params;
    try {
      const result = await ClienteService.getClienteListService(cliente_id)
      res.status(200).json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };
  
  const updateCliente = async (req, res) => {
    const moduloId = req.params.id;
    const { codigo,descripcion,status,cliente_id } = req.body;
    try {
      const updatedCliente = await ClienteService.updateClienteService(moduloId, {codigo,descripcion,status,cliente_id});
      res.status(200).json(updatedCliente);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  };
  
  const deleteCliente = async (req, res) => {
    const { id,cliente_id } = req.params;
    try {
      const result = await ClienteService.deleteClienteService(id,cliente_id);
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
  