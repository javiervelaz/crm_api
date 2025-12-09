const express = require('express');
const router = express.Router();
const { authenticateJWT } = require('../middleware/authMiddleware');
const pool = require('../pool');
const { createSubscription, saveSubscription } = require('../services/billing/mercadoPagoService');

router.post('/checkout', authenticateJWT, async (req, res) => {
  try {
    const { tierCode } = req.body;
    const user = req.user;
    console.log(user)
    if (!user || !user.cliente_id) {
      return res.status(403).json({ error: 'Usuario sin cliente asociado' });
    }

    const clienteRes = await pool.query(
      `SELECT id, nombre, contacto_email FROM cliente WHERE id = $1`,
      [user.cliente_id]
    );

    const cliente = clienteRes.rows[0];
    if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });

    const tierRes = await pool.query(
      `SELECT id, code, precio_mensual FROM tier WHERE UPPER(code) = $1`,
      [tierCode.toUpperCase()]
    );

    const tier = tierRes.rows[0];
    if (!tier) return res.status(400).json({ error: 'Plan inválido' });
   
    const { initPoint, preapprovalId } = await createSubscription(cliente, tier);

    await saveSubscription(cliente.id, tier.id, preapprovalId);

    return res.json({ initPoint, preapprovalId });

  } catch (err) {
    console.error('Error en /checkout:', err);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
