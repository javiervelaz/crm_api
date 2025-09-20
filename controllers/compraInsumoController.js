const CompraInsumoService = require('../services/compra_insumo/compreInsumoService');


const createCompraInsumo = async (req, res) => {
  const {  registro_diario_id,insumo,cantidad,precio_total,usuario_id,sucursal_id } = req.body;

  try {
    const result = await CompraInsumoService.createCompraInsumoService({  registro_diario_id,insumo,cantidad,precio_total,usuario_id,sucursal_id });
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const getCompraInsumoById = async (req, res) => {
    const { id } = req.params;
    try {
      const result = await CompraInsumoService.getCompraInsumoService({ id });
        if (!result) {
          return res.status(404).json({ error: 'Compra insumo not found' });
        }
        res.status(200).json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  };

  const getCompraInsumoList = async (req, res) => {
    try {
      const result = await CompraInsumoService.getCompraInsumoListService()
      res.status(200).json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };
  
  const updateCompraInsumo = async (req, res) => {
    const id = req.params.id;
    const {registro_diario_id,insumo,cantidad,precio_total,usuario_id,sucursal_id } = req.body;
    try {
      const result = await CompraInsumoService.updateCompraInsumoService(id, {registro_diario_id,insumo,cantidad,precio_total,usuario_id,sucursal_id});
      res.status(200).json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  };
  
  const deleteCompraInsumo = async (req, res) => {
    const { id } = req.params;
    try {
      const result = await CompraInsumoService.deleteCompraInsumoService(id);
      res.status(200).json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };

module.exports = {
    createCompraInsumo,
    getCompraInsumoById,
    getCompraInsumoList,
    updateCompraInsumo,
    deleteCompraInsumo
  };
  