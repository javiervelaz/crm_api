// crm_api/services/cliente/planService.js
const pool = require('../../pool');

const PLAN_FEATURES = {
  FREE: {
    canUseReports: false,
    canUseWhatsappBot: false,
  },
  BASIC: {
    canUseReports: false,
    canUseWhatsappBot: false,
  },
  PREMIUM: {
    canUseReports: true,
    canUseWhatsappBot: true,
  },
};

const getClienteTierAndFeatures = async (clienteId) => {
  if (!clienteId) {
    throw new Error('clienteId requerido para obtener tier');
  }

  const result = await pool.query(
    `
    SELECT c.id, c.nombre, t.code AS tier_code, t.nombre_publico
    FROM cliente c
    LEFT JOIN tier t ON t.id = c.tier_id
    WHERE c.id = $1
    `,
    [clienteId]
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error('Cliente no encontrado');
  }

  const tierCode = (row.tier_code || 'FREE').toUpperCase();
  const features = PLAN_FEATURES[tierCode] || PLAN_FEATURES['FREE'];

  return {
    clienteId: row.id,
    clienteNombre: row.nombre,
    tierCode,
    tierNombre: row.nombre_publico || tierCode,
    features,
  };
};

module.exports = {
  getClienteTierAndFeatures,
};
