const db = require('../../model/salida_caja/db');

const createSalidaCajaService = async (dataArray) => {
  if (!Array.isArray(dataArray) || dataArray.length === 0) {
    throw new Error('Se debe enviar un array con al menos un elemento');
  }

  const promesas = dataArray.map((data) => {
    const { registro_diario_id, categoria_salida_id, descripcion, monto, usuario_id ,cliente_id} = data;

    if (!descripcion || !monto || !registro_diario_id || !categoria_salida_id || !usuario_id) {
      throw new Error('Todos los campos son requeridos por cada registro');
    }

    return db.createSalidaCaja({
      registro_diario_id,
      categoria_salida_id,
      descripcion,
      monto,
      usuario_id,
      cliente_id
    });
  });

  return await Promise.all(promesas);
};


  const getSalidaCajaByIdService = async (id, cliente_id) => {
    const result = await db.getSalidaCajaById(id, cliente_id);
    return result.rows[0];
  }

  const getSalidaCajaListService = async (id,cliente_id) => {
    const result = await db.getSalidasCajas(id, cliente_id);
    return result.rows;
  }

  const updateSalidaCajaService = async (Id,data) => {
    const { descripcion, monto, cliente_id } = data;
    if (!descripcion  ) {
      throw new Error('All fields are required');
    }
    
    const result = await db.updateSalidaCaja(Id, { descripcion, monto, cliente_id });
    return result;
  }

  const deleteSalidaCajaService = async (id, cliente_id) => {
    const result = await db.deleteSalidaCaja(id, cliente_id);
    if (!result) {
      return res.status(404).json({ error: 'SalidaCaja not found' });
    }
    return result;
  }
  const getMontoGastosdService = async (id,data,cliente_id) => {
    const result = await db.getMontoTotalDiarioGastosPorTipo(id,data,cliente_id);
    console.log(result);
    return result;
  }

  module.exports = {
    createSalidaCajaService,
    getSalidaCajaByIdService,
    getSalidaCajaListService,
    updateSalidaCajaService,
    deleteSalidaCajaService,
    getMontoGastosdService
};