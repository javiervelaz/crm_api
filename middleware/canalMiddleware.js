// middleware/canalMiddleware.js
//
// Gating del micrositio según el canal por el que entró el cliente final:
//   link              → canUsePedidosOnline (todos los planes)
//   telegram/whatsapp → canUseBot (planes pagos)
// Además, si el token viene de una cuenta de canal, la cuenta tiene que seguir
// activa: desactivar el link o desconectar el bot mata las sesiones abiertas.
const planService = require('../services/cliente/planService');
const canalesDb = require('../model/canales/db');

const FEATURE_POR_CANAL = { link: 'canUsePedidosOnline', telegram: 'canUseBot', whatsapp: 'canUseBot' };

const requireCanalActivo = async (req, res, next) => {
  try {
    const canal = req.handoff?.canal || 'whatsapp';
    if (canal === 'whatsapp' && process.env.CANAL_WHATSAPP_ENABLED !== 'true') {
      return res.status(403).json({ error: 'Canal deshabilitado', code: 'CANAL_INACTIVO' });
    }

    const canalCuentaId = req.handoff?.canalCuentaId;
    if (canalCuentaId != null) {
      const cuenta = await canalesDb.getCuentaInterna(Number(canalCuentaId));
      if (!cuenta || Number(cuenta.cliente_id) !== req.clienteId || cuenta.status !== 'active') {
        return res.status(403).json({ error: 'Este link ya no está activo', code: 'CANAL_INACTIVO' });
      }
    }

    const plan = await planService.getClienteTierAndFeatures(req.clienteId);
    const feature = FEATURE_POR_CANAL[canal] || 'canUseBot';
    if (plan.isExpired || !plan.features[feature]) {
      return res.status(403).json({ error: 'Este comercio no tiene pedidos online activos', code: 'PLAN_INACTIVE' });
    }
    req.planCliente = plan;
    return next();
  } catch (err) {
    console.error('[canal] requireCanalActivo:', err.message);
    return res.status(500).json({ error: 'Error verificando el canal' });
  }
};

module.exports = { requireCanalActivo, FEATURE_POR_CANAL };
