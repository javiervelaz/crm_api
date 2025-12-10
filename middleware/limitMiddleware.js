// crm_api/middleware/limitMiddleware.js
const { getClienteTierAndFeatures } = require('../services/cliente/planService');
const pool = require('../pool');
const dayjs = require('dayjs');

const requireLimit = (limitKey) => {
  return async (req, res, next) => {
    const user = req.user;
    if (!user || !user.cliente_id) {
      return res.status(403).json({ error: 'Cliente no asociado al usuario' });
    }

    const { features, tierCode } = await getClienteTierAndFeatures(user.cliente_id);
    const limitValue = features[limitKey];

    // Si el plan no tiene restricción en este ítem
    if (limitValue == null) return next();

    try {
      let countRes;

      switch (limitKey) {
        case 'maxPedidosMensuales':
          const desde = dayjs().startOf('month').format('YYYY-MM-DD');
          countRes = await pool.query(
            `SELECT COUNT(*) FROM registro_diario WHERE cliente_id = $1 AND fecha >= $2`,
            [user.cliente_id, desde]
          );
          break;

        case 'maxProductos':
          countRes = await pool.query(
            `SELECT COUNT(*) FROM producto WHERE cliente_id = $1`,
            [user.cliente_id]
          );
          break;

        default:
          return res.status(500).json({ error: 'Restricción no implementada: ' + limitKey });
      }

      const currentCount = Number(countRes.rows[0].count);
      if (currentCount >= limitValue) {
        return res.status(403).json({
          error: `Tu plan (${tierCode}) permite hasta ${limitValue} ${limitKey}. Ya alcanzaste el límite.`
        });
      }

      next();
    } catch (err) {
      console.error('Error en requireLimit:', err);
      return res.status(500).json({ error: 'Error evaluando restricción de plan' });
    }
  };
};

module.exports = { requireLimit };
