// middleware/cuitMiddleware.js — sin CUIT no se toma el primer pedido desde el panel.
const cuitDb = require('../model/cliente/cuit');

const requireCuit = async (req, res, next) => {
  const clienteId = req.user && req.user.cliente_id;
  if (!clienteId) return res.status(403).json({ error: 'Cliente no asociado al usuario' });
  try {
    if (await cuitDb.getCuit(clienteId)) return next();
    return res.status(403).json({
      error: 'Para tomar pedidos primero completá el CUIT de tu comercio.',
      code: 'CUIT_REQUERIDO',
    });
  } catch (err) {
    console.error('Error en requireCuit:', err);
    return res.status(500).json({ error: 'Error validando los datos del comercio' });
  }
};

module.exports = { requireCuit };
