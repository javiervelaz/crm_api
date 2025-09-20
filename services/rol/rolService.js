const e = require('express');
const db = require('../../model/roles/db');
const { emit } = require('../../node');

const createRolService = async (rol) => {
    const { descripcion } = rol;
    // Validación de campos requeridos
    if (!descripcion ) {
      throw new Error('All fields are required');
    }
    const newRol = await db.createRol({ descripcion });
    return newRol;
  }; 

  const getRolByIdService = async (id) => {
    const result = await db.getRolById(id);
    return result.rows[0];
  }

  const getRolListService = async () => {
    const result = await db.getRols();
    return result.rows;
  }

  const updateRolService = async (rolId,rol) => {
    const { descripcion } = rol;
    if (!descripcion  ) {
      throw new Error('All fields are required');
    }
    
    const updatedRol = await db.updateRol(rolId, { descripcion});
    return updatedRol;
  }

  const deleteRolService = async (id) => {
    const result = await db.deleteRol(id);
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