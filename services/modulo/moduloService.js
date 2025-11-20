const e = require('express');
const db = require('../../model/modulos/db');
const { emit } = require('../../node');

const createModuloService = async (Modulo) => {
    const { codigo,descripcion, status,cliente_id } = Modulo;
    // Validación de campos requeridos
    if (!descripcion || !status || !codigo ) {
      throw new Error('All fields are required');
    }
    const newModulo = await db.createModulo({ codigo,descripcion, status,cliente_id });
    return newModulo;
  }; 

  const getModuloByIdService = async (id,cliente_id) => {
    const result = await db.getModuloById(id,cliente_id);
    return result;
  }

  const getModuloListService = async (cliente_id) => {
    const result = await db.getModulos(cliente_id);
    return result;
  }

  const updateModuloService = async (ModuloId,Modulo) => {
    const { codigo,descripcion,status,cliente_id } = Modulo;
   
    const updatedModulo = await db.updateModulo(ModuloId, { codigo,descripcion,status,cliente_id});
    return updatedModulo;
  }

  const deleteModuloService = async (id,cliente_id) => {
    const result = await db.deleteModulo(id,cliente_id);
    if (!result) {
      return res.status(404).json({ error: 'Modulo not found' });
    }
    return result;
  }

  const getPermisosByModuloIdService = async (cliente_id, id_modulo) => {
    const result = await db.getPermisosByModuloId(cliente_id, id_modulo);
    return result.rows;
  };

  module.exports = {
    createModuloService,
    getModuloByIdService,
    getModuloListService,
    updateModuloService,
    deleteModuloService,
    getPermisosByModuloIdService
};