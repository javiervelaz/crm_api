const MedioPagoService = require('../services/medio_pago/medioPagoService');


const createMedioPago = async (req, res) => {
  const {  descripcion } = req.body;

  try {
    const result = await MedioPagoService.createMedioPagoService({  descripcion });
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const getMedioPagoById = async (req, res) => {
    const { id } = req.params;
    try {
      const MedioPago = await MedioPagoService.getMedioPagoByIdService({ id });
        if (!MedioPago) {
          return res.status(404).json({ error: 'MedioPago not found' });
        }
        res.status(200).json(MedioPago);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  };

  const getMedioPagoList = async (req, res) => {
    try {
      const result = await MedioPagoService.getMedioPagoListService()
      res.status(200).json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };
  
  const updateMedioPago = async (req, res) => {
    const Id = req.params.id;
    const {  descripcion } = req.body;
    try {
      const result = await MedioPagoService.updateMedioPagoService(Id, { descripcion});
      res.status(200).json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  };
  
  const deleteMedioPago = async (req, res) => {
    const { id } = req.params;
    try {
      const result = await MedioPagoService.deleteMedioPagoService(id);
      res.status(200).json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };

module.exports = {
    createMedioPago,
    getMedioPagoById,
    getMedioPagoList,
    updateMedioPago,
    deleteMedioPago
  };
  