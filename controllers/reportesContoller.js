const reporteService = require('../services/reportes/reporteService');




  const getVentasFiltersController = async (req, res) => {
    try {
      const result = await reporteService.getReporteWithFiltersService(req.body)
      res.status(200).json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };

  const getClientesFiltersController = async (req, res) => {
    try {
      const result = await reporteService.getReporteClientesWithFiltersService(req.body)
      res.status(200).json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };
  

  const getGastosPorTipoFiltersController = async (req, res) => {
    try {
      const result = await reporteService.getReporteGatosPorTipoService(req.body)
      res.status(200).json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };

  const getGastosPorCategoriaSalidaFiltersController = async (req, res) => {
    try {
      const result = await reporteService.getReporteGatosPorCategoriaSalidaService(req.body)
      res.status(200).json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };
  const getCategoriaSalidaController = async (req, res) => {
    const {  cliente_id } = req.params;
    if(!cliente_id) return res.status(404).json( { error: "No se puede filtrar por cliente"});
    try {
      const result = await reporteService.getCategoriaSalidaService(cliente_id)
      res.status(200).json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };
  const getCategoriaTipoController = async (req, res) => {
    try {
      const result = await reporteService.getCategoriaTipoService()
      res.status(200).json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };
  
  

module.exports = {
    getVentasFiltersController,
    getGastosPorTipoFiltersController,
    getGastosPorCategoriaSalidaFiltersController,
    getCategoriaSalidaController,
    getCategoriaTipoController,
    getClientesFiltersController
  };
  