// crm_api/services/cliente/planService.js
const pool = require('../../pool');

const PLAN_FEATURES = {
  FREE: {
    canUseReports: false,
    canUseWhatsappBot: false,
    canUseBot: false,             // bots de Telegram / WhatsApp
    canUsePedidosOnline: true,    // link público del micrositio
    maxPedidosMensuales: 50,
    maxProductos: 5,
    diasDeTrial: 14,
  },
  BASIC: {
    canUseReports: false,
    canUseWhatsappBot: false,
    canUseBot: false,
    canUsePedidosOnline: true,
    maxPedidosMensuales: null,
    maxProductos: null,
  },
  PREMIUM: {
    canUseReports: true,
    canUseWhatsappBot: true,
    canUseBot: true,
    canUsePedidosOnline: true,
    maxPedidosMensuales: null,
    maxProductos: null,
  },
};
// CUSTOM = PREMIUM pagado anual con descuento: mismas prestaciones.
PLAN_FEATURES.CUSTOM = { ...PLAN_FEATURES.PREMIUM };


const getClienteTierAndFeatures = async (clienteId) => {
  if (!clienteId) throw new Error('clienteId requerido');

  const result = await pool.query(`
    SELECT c.id, c.nombre, c.tier_expiration_date, t.code AS tier_code, t.nombre_publico
    FROM cliente c
    LEFT JOIN tier t ON t.id = c.tier_id
    WHERE c.id = $1
  `, [clienteId]);

  const row = result.rows[0];
  if (!row) throw new Error('Cliente no encontrado');

  const tierCode = (row.tier_code || 'FREE').toUpperCase();
  let features = PLAN_FEATURES[tierCode];
  if (!features) {
    // Que un tier nuevo sin features no vuelva a degradarse a FREE en silencio
    console.warn(`[planService] tier desconocido "${tierCode}" (cliente ${row.id}): se aplican features de FREE`);
    features = PLAN_FEATURES.FREE;
  }

  const isExpired = Boolean(row.tier_expiration_date && new Date(row.tier_expiration_date) < new Date());

  return {
    clienteId: row.id,
    clienteNombre: row.nombre,
    tierCode,
    tierNombre: row.nombre_publico || tierCode,
    features,
    isExpired,
  };
};


/**
 * Chequeo de feature para usar dentro de services/routers sin req.user
 * (n8n, micrositio). Lanza un Error con status 403 y code PLAN_INACTIVE si
 * el plan no la incluye o está vencido.
 */
const assertFeature = async (clienteId, featureName) => {
  const plan = await module.exports.getClienteTierAndFeatures(clienteId);
  if (plan.isExpired || !plan.features[featureName]) {
    const err = new Error(
      plan.isExpired
        ? `El plan ${plan.tierCode} está vencido`
        : `El plan ${plan.tierCode} no incluye ${featureName}`
    );
    err.status = 403;
    err.code = 'PLAN_INACTIVE';
    throw err;
  }
  return plan;
};

module.exports = {
  PLAN_FEATURES,
  getClienteTierAndFeatures,
  assertFeature,
};
