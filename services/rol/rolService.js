const e = require('express');
const db = require('../../model/roles/db');
const { emit } = require('../../node');

const createRolService = async (rol) => {
    const { descripcion,cliente_id } = rol;
    // Validación de campos requeridos
    if (!descripcion ) {
      throw new Error('All fields are required');
    }
    const newRol = await db.createRol({ descripcion,cliente_id });
    return newRol;
  }; 

  const getRolByIdService = async (id,cliente_id) => {
    const result = await db.getRolById(id,cliente_id);
    return result;
  }

  const getRolListService = async (cliente_id) => {
    const result = await db.getRols(cliente_id);
    return result.rows;
  }

  const updateRolService = async (rolId,rol) => {
    const { descripcion ,cliente_id} = rol;
    if (!descripcion  ) {
      throw new Error('All fields are required');
    }
    
    const updatedRol = await db.updateRol(rolId, { descripcion,cliente_id});
    return updatedRol;
  }

  const deleteRolService = async (id,cliente_id) => {
    const result = await db.deleteRol(id,cliente_id);
    if (!result) {
      return res.status(404).json({ error: 'Rol not found' });
    }
    return result;
  }

  module.exports = {
    createRolService,
    getRolByIdService,
    getRolListService,
    updateRolService,
    deleteRolService
};