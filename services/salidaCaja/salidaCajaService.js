const db = require('../../model/salida_caja/db');

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Alta de gastos (array). La caja abierta es obligatoria sólo si el tenant
 * tiene el módulo 'operaciones'; sin él no hay caja que abrir y el gasto se
 * guarda sin registro diario (ver migrations/010_gastos_sin_caja.sql).
 *
 * Se valida todo el lote antes de insertar: antes un ítem inválido en el
 * medio dejaba insertados los anteriores.
 */
const createSalidaCajaService = async (dataArray) => {
  if (!Array.isArray(dataArray) || dataArray.length === 0) {
    throw new Error('Se debe enviar un array con al menos un elemento');
  }

  const cliente_id = dataArray[0]?.cliente_id;
  if (!cliente_id) throw new Error('Falta cliente_id');
  const usaCaja = await db.tenantUsaCaja(cliente_id);
  const hayMedioPago = dataArray.some((d) => d.medio_pago_id !== undefined && d.medio_pago_id !== null);
  const mediosValidos = hayMedioPago ? new Set(await db.getMediosPagoIds()) : null;

  const items = dataArray.map((data) => {
    const { registro_diario_id, categoria_salida_id, descripcion, monto, usuario_id } = data;

    if (!descripcion || !monto || !categoria_salida_id || !usuario_id) {
      throw new Error('Todos los campos son requeridos por cada registro');
    }
    if (!(Number(monto) > 0)) {
      throw new Error('El monto debe ser mayor a cero');
    }
    const medio_pago_id = data.medio_pago_id ?? null;
    if (medio_pago_id !== null && !(Number.isInteger(medio_pago_id) && mediosValidos.has(medio_pago_id))) {
      throw new Error('Medio de pago inválido');
    }
    if (usaCaja && !registro_diario_id) {
      throw new Error('Para registrar gastos tenés que tener la caja abierta');
    }

    return {
      registro_diario_id: usaCaja ? registro_diario_id : null,
      categoria_salida_id,
      descripcion,
      monto,
      usuario_id,
      cliente_id,
      medio_pago_id,
    };
  });

  return await Promise.all(items.map((item) => db.createSalidaCaja(item)));
};

/** ¿Este tenant necesita caja abierta para cargar gastos? Lo consulta la UI de Flujo. */
const getGastosConfigService = async (cliente_id) => ({
  requiereCaja: await db.tenantUsaCaja(cliente_id),
});

/** Gastos entre dos fechas YYYY-MM-DD (inclusive), máximo un año. */
const getGastosPorPeriodoService = async (cliente_id, desde, hasta) => {
  if (!FECHA_RE.test(String(desde)) || !FECHA_RE.test(String(hasta))) {
    const err = new Error('desde y hasta deben tener formato YYYY-MM-DD');
    err.status = 400;
    throw err;
  }
  const d = new Date(`${desde}T00:00:00Z`);
  const h = new Date(`${hasta}T00:00:00Z`);
  const fechaReal = (f, s) => !Number.isNaN(f.getTime()) && f.toISOString().slice(0, 10) === s;
  if (!fechaReal(d, desde) || !fechaReal(h, hasta) || d > h) {
    const err = new Error('Rango de fechas inválido');
    err.status = 400;
    throw err;
  }
  if ((h - d) / 86_400_000 > 366) {
    const err = new Error('El rango no puede superar un año');
    err.status = 400;
    throw err;
  }
  return db.getSalidasCajasPorPeriodo(cliente_id, desde, hasta);
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
  const getMontoGastosEfectivoService = async (registro_diario_id, cliente_id) =>
    db.getMontoGastosEfectivo(registro_diario_id, cliente_id);

  const getMontoGastosdService = async (id,data,cliente_id) => {
    const result = await db.getMontoTotalDiarioGastosPorTipo(id,data,cliente_id);
    console.log(result);
    return result;
  }

  module.exports = {
    getGastosConfigService,
    getGastosPorPeriodoService,
    createSalidaCajaService,
    getSalidaCajaByIdService,
    getSalidaCajaListService,
    updateSalidaCajaService,
    deleteSalidaCajaService,
    getMontoGastosdService,
    getMontoGastosEfectivoService
};