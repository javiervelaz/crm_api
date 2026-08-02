// crm_api/middleware/limitMiddleware.js
const planService = require('../services/cliente/planService');
const pool = require('../pool');
const dayjs = require('dayjs');

const requireLimit = (limitKey) => {
  return async (req, res, next) => {
    const user = req.user;
    if (!user || !user.cliente_id) {
      return res.status(403).json({ error: 'Cliente no asociado al usuario' });
    }

    const { features, tierCode } = await planService.getClienteTierAndFeatures(user.cliente_id);
    const limitValue = features[limitKey];

    // Si el plan no tiene restriccion en este item
    if (limitValue == null) return next();

    try {
      let countRes;

      switch (limitKey) {
        case 'maxPedidosMensuales': {
          countRes = await pool.query(
            `SELECT COUNT(*) FROM pedido
            WHERE cliente_id = $1
              AND created_at >= date_trunc('month', CURRENT_DATE)`,
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

        default:
          return res.status(500).json({ error: 'Restriccion no implementada: ' + limitKey });
      }

      const currentCount = Number(countRes.rows[0].count);
      if (currentCount >= limitValue) {
        return res.status(403).json({
          error: 'Tu plan (' + tierCode + ') permite hasta ' + limitValue + ' ' + limitKey + '. Ya alcanzaste el limite.',
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
