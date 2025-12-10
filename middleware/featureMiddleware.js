// crm_api/middleware/featureMiddleware.js
const { getClienteTierAndFeatures } = require('../services/cliente/planService');

const requireFeature = (featureName) => {
  return async (req, res, next) => {
    try {
      // 🔥 YA ESTÁ AUTENTICADO
      const user = req.user;
      if (!user || !user.cliente_id) {
        return res.status(403).json({ error: 'Cliente no asociado al usuario' });
      }

      const { features, tierCode,isExpired } = await getClienteTierAndFeatures(user.cliente_id);

      if (isExpired) {
        return res.status(403).json({
          error: `Tu plan actual (${tierCode}) ha vencido. Debés renovarlo para acceder a esta funcionalidad.`,
        });
      }
      // Validar que exista la key
      if (!Object.prototype.hasOwnProperty.call(features, featureName)) {
        return res.status(403).json({
          error: `La funcionalidad "${featureName}" no está configurada para el plan ${tierCode}`,
        });
      }

      // Validar acceso
      if (!features[featureName]) {
        return res.status(403).json({
          error: `Tu plan actual (${tierCode}) no tiene acceso a esta funcionalidad`,
        });
      }
      
      // dejar info opcional por si el controller la quiere usar
      req.clienteTier = { tierCode, features ,isExpired};

      next();
    } catch (err) {
      console.error('Error en requireFeature:', err);
      return res.status(500).json({ error: 'Error verificando el plan del cliente' });
    }
  };
};

module.exports = { requireFeature };
