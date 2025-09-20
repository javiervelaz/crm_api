const e = require('express');
const db = require('../../model/compra_insumo/db');
const { emit } = require('../../node');

const createCompraInsumoService = async (compra) => {
    const { registro_diario_id,insumo,cantidad,precio_total,usuario_id,sucursal_id } = compra;
    // Validación de campos requeridos
    if (!descripcion || !cantidad || !precio_total ) {
      throw new Error('All fields are required');
    }
    const newModulo = await db.createCompraInsumo({ registro_diario_id,insumo,cantidad,precio_total,usuario_id,sucursal_id });
    return newModulo;
  }; 

  const getCompraInsumoService = async (id) => {
    const result = await db.getCompraInsumoById(id);
    return result.rows[0];
  }

  const getCompraInsumoListService = async () => {
    const result = await db.getComprasInsumos();
    return result.rows;
  }

  const updateCompraInsumoService = async (id,Modulo) => {
    const {registro_diario_id,insumo,cantidad,precio_total,usuario_id,sucursal_id } = Modulo;
    if (!descripcion ||  !cantidad || !precio_total ) {
      throw new Error('All fields are required');
    }
    
    const updatedModulo = await db.updateCompraInsumo(id, { registro_diario_id,insumo,cantidad,precio_total,usuario_id,sucursal_id});
    return updatedModulo;
  }

  const deleteCompraInsumoService = async (id) => {
    const result = await db.deleteCompraInsumo(id);
    if (!result) {
      return res.status(404).json({ error: 'Compra insumo not found' });
    }
    return result;
  }

  module.exports = {
    createCompraInsumoService,
    getCompraInsumoService,
    getCompraInsumoListService,
    updateCompraInsumoService,
    deleteCompraInsumoService
};