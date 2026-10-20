// crm_api/middleware/featureMiddleware.js
const planService = require('../services/cliente/planService');

/**
 * Gating por plan. El tenant se resuelve con `getClienteId`: por defecto el
 * del request (req.clienteId lo setean scopeTenant, authenticateHandoff y el
 * router interno de n8n) y, si no hay, el del JWT de usuario.
 * Responde 403 con code PLAN_INACTIVE si el plan no incluye la feature o está
 * vencido.
 */
const requireFeature = (featureName, { getClienteId } = {}) => {
  const resolveCliente = getClienteId || ((req) => req.clienteId ?? req.user?.cliente_id);

  return async (req, res, next) => {
    try {
      const clienteId = resolveCliente(req);
      if (!clienteId) {
        return res.status(403).json({ error: 'Cliente no asociado al usuario', code: 'NO_TENANT' });
      }

      const { features, tierCode, isExpired } = await planService.getClienteTierAndFeatures(clienteId);

      if (isExpired) {
        return res.status(403).json({
          error: `Tu plan actual (${tierCode}) ha vencido. Debés renovarlo para acceder a esta funcionalidad.`,
          code: 'PLAN_INACTIVE',
        });
      }
      if (!Object.prototype.hasOwnProperty.call(features, featureName)) {
        return res.status(403).json({
          error: `La funcionalidad "${featureName}" no está configurada para el plan ${tierCode}`,
          code: 'PLAN_INACTIVE',
        });
      }
      if (!features[featureName]) {
        return res.status(403).json({
          error: `Tu plan actual (${tierCode}) no tiene acceso a esta funcionalidad`,
          code: 'PLAN_INACTIVE',
        });
      }

      req.clienteTier = { tierCode, features, isExpired };
      next();
    } catch (err) {
      console.error('Error en requireFeature:', err);
      return res.status(500).json({ error: 'Error verificando el plan del cliente' });
    }
  };
};

module.exports = { requireFeature };
