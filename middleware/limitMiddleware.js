// crm_api/middleware/limitMiddleware.js
const planService = require('../services/cliente/planService');
const pool = require('../pool');
const planBloqueo = require('../model/senales/planBloqueo');
const { inicioMesUtcSql } = require('../utils/fechaTenant');

const requireLimit = (limitKey) => {
  return async (req, res, next) => {
    const user = req.user;
    if (!user || !user.cliente_id) {
      return res.status(403).json({ error: 'Cliente no asociado al usuario' });
    }

    try {
      const { features, tierCode } = await planService.getClienteTierAndFeatures(user.cliente_id);
      const limitValue = features[limitKey];

      // Si el plan no tiene restriccion en este item
      if (limitValue == null) return next();

      let countRes;

      switch (limitKey) {
        case 'maxPedidosMensuales': {
          countRes = await pool.query(
            `SELECT COUNT(*) FROM pedido
            WHERE cliente_id = $1
              AND created_at >= ${inicioMesUtcSql('$1')}`,
            [user.cliente_id]
          );
          break;
        }

        case 'maxProductos': {
          countRes = await pool.query(
            'SELECT COUNT(*) FROM producto WHERE cliente_id = $1',
            [user.cliente_id]
          );
          break;
        }

        case 'maxStockItems': {
          countRes = await pool.query(
            'SELECT COUNT(*) FROM stock_item WHERE cliente_id = $1 AND activo = true',
            [user.cliente_id]
          );
          break;
        }

        default:
          return res.status(500).json({ error: 'Restriccion no implementada: ' + limitKey });
      }

      const currentCount = Number(countRes.rows[0].count);
      if (currentCount >= limitValue) {
        const LABELS = { maxProductos: 'productos', maxPedidosMensuales: 'pedidos por mes', maxStockItems: 'ítems de stock' };
        const label = LABELS[limitKey] || 'recursos';
        // Señal comercial (migración 029): qué límite frena a los comercios.
        await planBloqueo.registrarSeguro({
          clienteId: user.cliente_id, tipo: 'limite', clave: limitKey, tierCode,
          ruta: planBloqueo.rutaSegura(req), userId: user.userId ?? user.id ?? null,
        });
        return res.status(403).json({
          error: 'Tu plan (' + tierCode + ') permite hasta ' + limitValue + ' ' + label + '. Ya alcanzaste el límite.',
        });
      }

      next();
    } catch (err) {
      console.error('Error en requireLimit:', err);
      return res.status(500).json({ error: 'Error evaluando restriccion de plan' });
    }
  };
};

module.exports = { requireLimit };
