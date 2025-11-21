const e = require('express');
const db = require('../../model/cliente/db');

const createClienteService = async (data) => {
    const { nombre,cuit,adminNombre,adminApellido,adminEmail,adminDni } = data;
    // Validación de campos requeridos
    if (!nombre || !cuit  ) {
      throw new Error('All fields are required');
    }
    const result = await db.createCliente({ nombre,cuit,adminNombre,adminApellido,adminEmail,adminDni });
    return result;
  }; 

  const getClienteByIdService = async (id,cliente_id) => {
    const result = await db.getClienteById(id,cliente_id);
    return result;
  }

  const getClienteListService = async (cliente_id) => {
    const result = await db.getClientes(cliente_id);
    return result;
  }

  const updateClienteService = async (ClienteId,Cliente) => {
    const { codigo,descripcion,status,cliente_id } = Cliente;
   
    const updatedCliente = await db.updateCliente(ClienteId, { codigo,descripcion,status,cliente_id});
    return updatedCliente;
  }

  const deleteClienteService = async (id,cliente_id) => {
    const result = await db.deleteCliente(id,cliente_id);
    if (!result) {
      return res.status(404).json({ error: 'Cliente not found' });
    }
    return result;
  }



  module.exports = {
    createClienteService,
    getClienteByIdService,
    getClienteListService,
    updateClienteService,
    deleteClienteService,
};