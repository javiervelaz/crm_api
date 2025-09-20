const db = require('../../model/movimiento_inventario/db');

const createMovimientoInventarioService = async (inv) => {
    const { registro_diario_id, categoria, descripcion, monto,usuario_id,sucursal_id } = inv;
    // Validación de campos requeridos
    if (!categoria || !descripcion || !monto ) {
      throw new Error('All fields are required');
    }
    const result = await db.createMovimientoInventario({ registro_diario_id, categoria, descripcion, monto,usuario_id,sucursal_id });
    return result;
  }; 

  const getMovimientoInventarioService = async (id) => {
    const result = await db.getMovimientoInventarioById(id);
    return result.rows[0];
  }

  const getMovimientoInventarioListService = async () => {
    const result = await db.getMovimientosInventarios();
    return result.rows;
  }

  const updateMovimientoInventarioService = async (id,Modulo) => {
    const {sucursal_id, nombre, cantidad } = Modulo;
    if (!nombre ||  !cantidad  ) {
      throw new Error('All fields are required');
    }
    
    const result = await db.updatetMovimientoInventario(id, { sucursal_id, nombre, cantidad});
    return result;
  }

  const deleteMovimientoInventarioService = async (id) => {
    const result = await db.deletetMovimientoInventario(id);
    if (!result) {
      return res.status(404).json({ error: 'Inventario insumo not found' });
    }
    return result;
  }

  module.exports = {
    createMovimientoInventarioService,
    getMovimientoInventarioService,
    getMovimientoInventarioListService,
    updateMovimientoInventarioService,
    deleteMovimientoInventarioService
};