const express = require('express');
const router = express.Router();
const {
  activateTierForCliente,
  simulateWebhook,
  USE_MOCK
} = require('../services/billing/mercadoPagoService');
const pool = require('../pool');

/**
 * REAL WEBHOOK (MP_MOCK = false)
 */
router.post('/webhook', async (req, res) => {
  if (USE_MOCK) {
    return res.status(200).send('MOCK MODE ACTIVE');
  }

  try {
    const body = req.body;
    console.log('Webhook recibido REAL:', JSON.stringify(body));

    if (body.type !== 'preapproval' || !body.data?.id) {
      return res.status(200).send('IGNORED');
    }

    const preapprovalId = body.data.id;

    const subRes = await pool.query(
      `SELECT * FROM billing_subscription WHERE mp_preapproval_id = $1`,
      [preapprovalId]
    );

    const sub = subRes.rows[0];
    if (!sub) return res.status(200).send('OK');

    await pool.query(
      `UPDATE billing_subscription SET status = 'active' WHERE mp_preapproval_id = $1`,
      [preapprovalId]
    );

    await activateTierForCliente(sub.cliente_id, sub.tier_id);

    res.status(200).send('OK');
  } catch (err) {
    console.error('Error webhook real:', err);
    res.status(500).send('ERROR');
  }
});

/**
 * MOCK WEBHOOK (LOCAL ONLY)
 */
router.post('/mock', async (req, res) => {
  if (!USE_MOCK) {
    return res.status(400).json({ error: 'MOCK disabled in environment' });
  }

  const { preapprovalId } = req.body;

  if (!preapprovalId) {
    return res.status(400).json({ error: 'Missing preapprovalId' });
  }

  await simulateWebhook(preapprovalId);

  res.json({ ok: true });
});

module.exports = router;
