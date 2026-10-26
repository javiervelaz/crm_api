const express = require('express');
const router = express.Router();
const { registerTenantGuards } = require('../middleware/tenantMiddleware');

const { authenticateJWT } = require('../middleware/authMiddleware');
const pool = require('../pool');
const planService = require('../services/cliente/planService');
// Por el objeto del módulo (no destructurado): así los tests pueden stubearlo
const mp = require('../services/billing/mercadoPagoService');
registerTenantGuards(router);
router.post('/checkout', authenticateJWT, async (req, res) => {
  try {
    const { tierCode } = req.body;
    const user = req.user;
    if (!user || !user.cliente_id) {
      return res.status(403).json({ error: 'Usuario sin cliente asociado' });
    }

    const clienteRes = await pool.query(
      `SELECT id, nombre, contacto_email, rubro_codigo FROM cliente WHERE id = $1`,
      [user.cliente_id]
    );

    const cliente = clienteRes.rows[0];
    if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });

    if (!tierCode || typeof tierCode !== 'string') return res.status(400).json({ error: 'Plan inválido' });

    // Precio y disponibilidad del tier EN el rubro del cliente (rubro_tier)
    let tier;
    try {
      tier = await planService.ofertaContratable(cliente.rubro_codigo || 'gastronomia', tierCode);
    } catch (err) {
      if (err.status === 400) return res.status(400).json({ error: err.message, code: err.code });
      throw err;
    }
    if (!(tier.precio_mensual > 0)) {
      return res.status(400).json({ error: 'Ese plan no requiere pago', code: 'PLAN_SIN_COSTO' });
    }

    const paymentType = req.body.paymentType || 'one_time';

    if (paymentType === 'subscription') {
      const { initPoint, preapprovalId } = await mp.createSubscription(cliente, tier);
      await mp.saveSubscription(cliente.id, tier.id, preapprovalId, tier);
      return res.json({ initPoint, preapprovalId });
    }

    const { initPoint, sandboxInitPoint, paymentId } = await mp.createOneTimePayment(cliente, tier);
    return res.json({ initPoint, sandboxInitPoint, paymentId });

  } catch (err) {
    console.error('Error en /checkout:', err);
    return res.status(500).json({ error: 'No se pudo iniciar el pago' });
  }
});

module.exports = router;
