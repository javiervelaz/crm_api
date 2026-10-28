const SalidaCajaService = require('../services/salidaCaja/salidaCajaService');


const createSalidaCaja = async (req, res) => {
  try {
    // Tenant y usuario salen del JWT, no del body: antes el front mandaba
    // usuario_id y se guardaba tal cual (cualquiera podía firmar por otro).
    const items = Array.isArray(req.body)
      ? req.body.map((item) => ({ ...item, cliente_id: req.clienteId, usuario_id: req.user?.userId }))
      : req.body;
    const newSalidaCaja = await SalidaCajaService.createSalidaCajaService(items);
    res.status(201).json(newSalidaCaja);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const getGastosConfig = async (req, res, next) => {
  try {
    res.status(200).json(await SalidaCajaService.getGastosConfigService(req.clienteId));
  } catch (error) {
    next(error);
  }
};

const getGastosPorPeriodo = async (req, res, next) => {
  try {
    const { desde, hasta } = req.query;
    res.status(200).json(await SalidaCajaService.getGastosPorPeriodoService(req.clienteId, desde, hasta));
  } catch (error) {
    if (error.status === 400) return res.status(400).json({ error: error.message, code: 'RANGO_INVALIDO' });
    next(error);
  }
};

const getSalidaCajaById = async (req, res) => {
    const { id, cliente_id } = req.params;
    try {
      const SalidaCaja = await SalidaCajaService.getSalidaCajaByIdService({ id, cliente_id });
        if (!SalidaCaja) {
          return res.status(404).json({ error: 'SalidaCaja not found' });
        }
        res.status(200).json(SalidaCaja);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  };

  const getSalidaCajaList = async (req, res) => {
    const {  id, cliente_id } = req.params;
    if(!cliente_id) return res.status(404).json( { error: "No se puede filtrar por cliente"});
    try {
      const result = await SalidaCajaService.getSalidaCajaListService(id,cliente_id)
      res.status(200).json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };
  
  const updateSalidaCaja = async (req, res) => {
    const id = req.params.id;
    const {  descripcion, monto, cliente_id } = req.body;
    try {
      const updatedSalidaCaja = await SalidaCajaService.updateSalidaCajaService(id, { descripcion, monto, cliente_id});
      res.status(200).json(updatedSalidaCaja);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  };
  
  const deleteSalidaCaja = async (req, res) => {
    const { id, cliente_id } = req.params;
    try {
      const result = await SalidaCajaService.deleteSalidaCajaService(id, cliente_id);
      res.status(200).json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };

  const getMontoGastos = async (req, res) => {
    const { id } = req.params;
    const {  salida_categoria_id , cliente_id} = req.body
    try {
      const monto = await SalidaCajaService.getMontoGastosdService( id, salida_categoria_id, cliente_id );
        //if (!monto) {
          //return res.status(404).json({ error: 'SalidaCaja not found' });
        //}
        res.status(200).json(monto);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  };

  // Gastos del día pagados en efectivo (los que descuentan del cajón al cerrar caja).
  const getMontoGastosEfectivo = async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!Number.isInteger(id)) return res.status(400).json({ error: 'id inválido' });
      const monto = await SalidaCajaService.getMontoGastosEfectivoService(id, req.clienteId);
      res.status(200).json(monto);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  };

module.exports = {
    getGastosConfig,
    getGastosPorPeriodo,
    createSalidaCaja,
    getSalidaCajaById,
    getSalidaCajaList,
    updateSalidaCaja,
    deleteSalidaCaja,
    getMontoGastos,
    getMontoGastosEfectivo
  };
  