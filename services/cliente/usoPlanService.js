// services/cliente/usoPlanService.js — uso de los límites numéricos del plan.
//
// Alimenta la barra de uso del panel (GET /api/cliente-plan/uso) y decide en
// qué nivel de aviso está un comercio. El umbral y los textos viven acá para
// que el panel, el mail y el middleware hablen de lo mismo.
const usoDb = require('../../model/cliente/uso');

/** Desde qué fracción del límite se avisa que se está cerca. */
const UMBRAL_AVISO = 0.8;

/**
 * Catálogo de límites avisables. `mensual`: el contador se reinicia cada mes
 * calendario del comercio; los demás son un tope de stock (no se reinician).
 */
const LIMITES = {
  maxPedidosMensuales: { recurso: 'pedidos este mes', mensual: true, afectaLinkPublico: true },
  maxProductos: { recurso: 'productos', mensual: false, afectaLinkPublico: false },
  maxStockItems: { recurso: 'ítems de stock', mensual: false, afectaLinkPublico: false },
};

/**
 * 100 si ya está en el tope, 80 si pasó el umbral, null si todavía está lejos.
 * `usado` es lo que el comercio YA tiene cargado, no lo que está por cargar.
 */
const nivelPara = (usado, limite) => {
  const u = Number(usado);
  const l = Number(limite);
  if (!Number.isFinite(u) || !Number.isFinite(l) || l <= 0) return null;
  if (u >= l) return 100;
  if (u >= Math.ceil(l * UMBRAL_AVISO)) return 80;
  return null;
};

/**
 * Uso actual de cada límite que tiene el plan (los ilimitados no aparecen).
 * { maxProductos: { usado: 12, limite: 30, porcentaje: 40, nivel: null }, ... }
 */
const getUso = async (clienteId, features = {}) => {
  const out = {};
  for (const limitKey of Object.keys(LIMITES)) {
    const limite = features[limitKey];
    if (limite == null) continue;
    // eslint-disable-next-line no-await-in-loop
    const usado = await usoDb.contar(limitKey, clienteId);
    out[limitKey] = {
      usado,
      limite: Number(limite),
      porcentaje: Number(limite) > 0 ? Math.min(100, Math.round((usado / Number(limite)) * 100)) : 100,
      nivel: nivelPara(usado, limite),
    };
  }
  return out;
};

module.exports = { UMBRAL_AVISO, LIMITES, nivelPara, getUso };
