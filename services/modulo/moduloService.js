const e = require('express');
const db = require('../../model/modulos/db');
const { emit } = require('../../node');

const moduloNoDisponible = (codigo) => {
  const err = new Error(`El módulo "${codigo}" no está disponible para el rubro de este cliente`);
  err.status = 400;
  err.code = 'MODULO_FUERA_DE_RUBRO';
  return err;
};

const createModuloService = async (Modulo) => {
    const { codigo,descripcion, status,cliente_id } = Modulo;
    // Validación de campos requeridos
    if (!descripcion || !status || !codigo ) {
      throw new Error('All fields are required');
    }
    const permitido = await db.isCodigoEnRubroDelCliente(cliente_id, codigo);
    if (!permitido) {
      throw moduloNoDisponible(codigo);
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
    // Renombrar el código es otra forma de instalarse un módulo ajeno.
    if (codigo != null && !(await db.isCodigoEnRubroDelCliente(cliente_id, codigo))) {
      throw moduloNoDisponible(codigo);
    }
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