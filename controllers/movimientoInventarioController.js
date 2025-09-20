const MovimientoInventarioService = require('../services/movimiento_inventario/movimientoInventarioService');


const createInventarioInsumo = async (req, res) => {
  const { registro_diario_id, categoria, descripcion, monto,usuario_id,sucursal_id } = req.body;

  try {
    const result = await MovimientoInventarioService.createMovimientoInventarioService({ registro_diario_id, categoria, descripcion, monto,usuario_id,sucursal_id});
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const getInventarioInsumoById = async (req, res) => {
    const { id } = req.params;
    try {
      const result = await MovimientoInventarioService.getMovimientoInventarioService({ id });
        if (!result) {
          return res.status(404).json({ error: 'Inventario insumo not found' });
        }
        res.status(200).json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  };

  const getInventarioInsumoList = async (req, res) => {
    try {
      const result = await MovimientoInventarioService.getMovimientoInventarioListService()
      res.status(200).json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };
  
  const updateInventarioInsumo = async (req, res) => {
    const id = req.params.id;
    const {sucursal_id, nombre, cantidad } = req.body;
    try {
      const result = await MovimientoInventarioService.updateMovimientoInventarioService(id, {registro_diario_id, categoria, descripcion, monto,usuario_id,sucursal_id});
      res.status(200).json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  };
  
  const deleteInventarioInsumo = async (req, res) => {
    const { id } = req.params;
    try {
      const result = await MovimientoInventarioService.deleteMovimientoInventarioService(id);
      res.status(200).json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };

module.exports = {
    createInventarioInsumo,
    getInventarioInsumoById,
    getInventarioInsumoList,
    updateInventarioInsumo,
    deleteInventarioInsumo
  };
  