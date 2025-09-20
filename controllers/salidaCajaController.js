const SalidaCajaService = require('../services/salidaCaja/salidaCajaService');


const createSalidaCaja = async (req, res) => {
  try {
    const newSalidaCaja = await SalidaCajaService.createSalidaCajaService(req.body);
    res.status(201).json(newSalidaCaja);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const getSalidaCajaById = async (req, res) => {
    const { id } = req.params;
    try {
      const SalidaCaja = await SalidaCajaService.getSalidaCajaByIdService({ id });
        if (!SalidaCaja) {
          return res.status(404).json({ error: 'SalidaCaja not found' });
        }
        res.status(200).json(SalidaCaja);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  };

  const getSalidaCajaList = async (req, res) => {
    try {
      const result = await SalidaCajaService.getSalidaCajaListService()
      res.status(200).json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };
  
  const updateSalidaCaja = async (req, res) => {
    const id = req.params.id;
    const {  descripcion, monto } = req.body;
    try {
      const updatedSalidaCaja = await SalidaCajaService.updateSalidaCajaService(id, { descripcion, monto});
      res.status(200).json(updatedSalidaCaja);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  };
  
  const deleteSalidaCaja = async (req, res) => {
    const { id } = req.params;
    try {
      const result = await SalidaCajaService.deleteSalidaCajaService(id);
      res.status(200).json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };

  const getMontoGastos = async (req, res) => {
    const { id } = req.params;
    const {  salida_categoria_id } = req.body
    try {
      const monto = await SalidaCajaService.getMontoGastosdService( id, salida_categoria_id );
        //if (!monto) {
          //return res.status(404).json({ error: 'SalidaCaja not found' });
        //}
        res.status(200).json(monto);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  };

module.exports = {
    createSalidaCaja,
    getSalidaCajaById,
    getSalidaCajaList,
    updateSalidaCaja,
    deleteSalidaCaja,
    getMontoGastos
  };
  