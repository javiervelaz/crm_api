// crm_api/middleware/limitMiddleware.js
const planService = require('../services/cliente/planService');
const avisoLimite = require('../services/cliente/avisoLimiteService');
const usoDb = require('../model/cliente/uso');
const planBloqueo = require('../model/senales/planBloqueo');

const LABELS = { maxProductos: 'productos', maxPedidosMensuales: 'pedidos por mes', maxStockItems: 'ítems de stock' };

const requireLimit = (limitKey) => {
  return async (req, res, next) => {
    const user = req.user;
    if (!user || !user.cliente_id) {
      return res.status(403).json({ error: 'Cliente no asociado al usuario' });
    }

    try {
      const { features, tierCode, tierNombre, timezone } = await planService.getClienteTierAndFeatures(user.cliente_id);
      const limitValue = features[limitKey];

      // Si el plan no tiene restriccion en este item
      if (limitValue == null) return next();

      const currentCount = await usoDb.contar(limitKey, user.cliente_id);
      if (currentCount === null) {
        return res.status(500).json({ error: 'Restriccion no implementada: ' + limitKey });
      }

      // Aviso por mail (80 % / 100 %): una vez por período, nunca rompe el request.
      const avisar = () => avisoLimite.evaluar({
        clienteId: user.cliente_id, limitKey, usado: currentCount, limite: limitValue, tierCode, tierNombre, timezone,
      });

      if (currentCount >= limitValue) {
        const label = LABELS[limitKey] || 'recursos';
        // Señal comercial (migración 029): qué límite frena a los comercios.
        await planBloqueo.registrarSeguro({
          clienteId: user.cliente_id, tipo: 'limite', clave: limitKey, tierCode,
          ruta: planBloqueo.rutaSegura(req), userId: user.userId ?? user.id ?? null,
        });
        await avisar();
        // `code` + datos del límite: el front muestra el modal de upgrade con el
        // mensaje exacto en vez de un toast genérico.
        return res.status(403).json({
          error: 'Tu plan (' + tierCode + ') permite hasta ' + limitValue + ' ' + label + '. Ya alcanzaste el límite.',
          code: 'LIMITE_PLAN',
          limitKey,
          limite: Number(limitValue),
          usado: currentCount,
          tierCode,
        });
      }

      await avisar();
      next();
    } catch (err) {
      console.error('Error en requireLimit:', err);
      return res.status(500).json({ error: 'Error evaluando restriccion de plan' });
    }
  };
};

module.exports = { requireLimit };
