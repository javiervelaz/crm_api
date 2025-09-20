const InventarioInsumoService = require('../services/inventario_insumo/inventarioInsumoService');


const createInventarioInsumo = async (req, res) => {
  const {  sucursal_id, nombre, cantidad } = req.body;

  try {
    const result = await InventarioInsumoService.createInventarioInsumoService({  sucursal_id, nombre, cantidad });
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const getInventarioInsumoById = async (req, res) => {
    const { id } = req.params;
    try {
      const result = await InventarioInsumoService.getInventarioInsumoService({ id });
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
      const result = await InventarioInsumoService.getInventarioInsumoListService()
      res.status(200).json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };
  
  const updateInventarioInsumo = async (req, res) => {
    const id = req.params.id;
    const {sucursal_id, nombre, cantidad } = req.body;
    try {
      const result = await InventarioInsumoService.updateInventarioInsumoService(id, {sucursal_id, nombre, cantidad});
      res.status(200).json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  };
  
  const deleteInventarioInsumo = async (req, res) => {
    const { id } = req.params;
    try {
      const result = await InventarioInsumoService.deleteInventarioInsumoService(id);
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
  