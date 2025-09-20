const e = require('express');
const db = require('../../model/modulos/db');
const { emit } = require('../../node');

const createModuloService = async (Modulo) => {
    const { descripcion,status } = Modulo;
    // Validación de campos requeridos
    if (!descripcion || !status ) {
      throw new Error('All fields are required');
    }
    const newModulo = await db.createModulo({ descripcion,status });
    return newModulo;
  }; 

  const getModuloByIdService = async (id) => {
    const result = await db.getModuloById(id);
    return result.rows[0];
  }

  const getModuloListService = async () => {
    const result = await db.getModulos();
    return result.rows;
  }

  const updateModuloService = async (ModuloId,Modulo) => {
    const { descripcion,status } = Modulo;
    if (!descripcion || !status ) {
      throw new Error('All fields are required');
    }
    
    const updatedModulo = await db.updateModulo(ModuloId, { descripcion,status});
    return updatedModulo;
  }

  const deleteModuloService = async (id) => {
    const result = await db.deleteModulo(id);
    if (!result) {
      return res.status(404).json({ error: 'Modulo not found' });
    }
    return result;
  }

  module.exports = {
    createModuloService,
    getModuloByIdService,
    getModuloListService,
    updateModuloService,
    deleteModuloService
};