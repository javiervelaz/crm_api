const db = require('../../model/medio_pago/db');

const createMedioPagoService = async (data) => {
    const { descripcion } = data;
    // Validación de campos requeridos
    if (!descripcion  ) {
      throw new Error('All fields are required');
    }
    const result = await db.createMedioPago({ descripcion });
    return result;
  }; 

  const getMedioPagoByIdService = async (id) => {
    const result = await db.getMedioPagoById(id);
    return result.rows[0];
  }

  const getMedioPagoListService = async () => {
    const result = await db.getMedioPagos();
    return result.rows;
  }

  const updateMedioPagoService = async (Id,data) => {
    const { descripcion } = data;
    if (!descripcion  ) {
      throw new Error('All fields are required');
    }
    
    const result = await db.updateMedioPago(Id, { descripcion });
    return result;
  }

  const deleteMedioPagoService = async (id) => {
    const result = await db.deleteMedioPago(id);
    if (!result) {
      return res.status(404).json({ error: 'MedioPago not found' });
    }
    return result;
  }

  module.exports = {
    createMedioPagoService,
    getMedioPagoByIdService,
    getMedioPagoListService,
    updateMedioPagoService,
    deleteMedioPagoService
};