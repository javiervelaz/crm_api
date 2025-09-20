const db = require('../../model/inventario_insumo/db');

const createInventarioInsumoService = async (inv) => {
    const { sucursal_id, nombre, cantidad } = inv;
    // Validación de campos requeridos
    if (!nombre || !cantidad  ) {
      throw new Error('All fields are required');
    }
    const result = await db.createInventarioInsumo({ sucursal_id, nombre, cantidad });
    return result;
  }; 

  const getInventarioInsumoService = async (id) => {
    const result = await db.getInventarioInsumoById(id);
    return result.rows[0];
  }

  const getInventarioInsumoListService = async () => {
    const result = await db.getInventariosInsumos();
    return result.rows;
  }

  const updateInventarioInsumoService = async (id,Modulo) => {
    const {sucursal_id, nombre, cantidad } = Modulo;
    if (!nombre ||  !cantidad  ) {
      throw new Error('All fields are required');
    }
    
    const result = await db.updatetInventarioInsumo(id, { sucursal_id, nombre, cantidad});
    return result;
  }

  const deleteInventarioInsumoService = async (id) => {
    const result = await db.deleteInventarioInsumo(id);
    if (!result) {
      return res.status(404).json({ error: 'Inventario insumo not found' });
    }
    return result;
  }

  module.exports = {
    createInventarioInsumoService,
    getInventarioInsumoService,
    getInventarioInsumoListService,
    updateInventarioInsumoService,
    deleteInventarioInsumoService
};