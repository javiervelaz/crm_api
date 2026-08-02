const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const {
  activateTierForCliente,
  simulateWebhook,
  USE_MOCK
} = require('../services/billing/mercadoPagoService');
const pool = require('../pool');

/**
 * REAL WEBHOOK (MP_MOCK = false)
 * Nota: se lee process.env.MP_MOCK en tiempo de request (no al cargar el modulo)
 * para que los tests puedan cambiar el valor entre suites sin reiniciar el proceso.
 */
router.post('', async (req, res) => {
  if (process.env.MP_MOCK === 'true') {
    return res.status(200).send('MOCK MODE ACTIVE');
  }

  // Verificar firma del webhook de MercadoPago (obligatorio en produccion)
  const xSignature = req.headers['x-signature'];
  const xRequestId = req.headers['x-request-id'];
  const mpWebhookSecret = process.env.MP_WEBHOOK_SECRET;

  if (!mpWebhookSecret) {
    console.error('[BILLING WEBHOOK] MP_WEBHOOK_SECRET no esta configurado -- rechazando request por seguridad');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  if (!xSignature || !xRequestId) {
    return res.status(401).json({ error: 'Missing webhook signature headers' });
  }

  const dataId = req.query['data.id'] || '';
  const parts = xSignature.split(',').reduce((acc, part) => {
    const [key, value] = part.trim().split('=');
    acc[key] = value;
    return acc;
  }, {});

  const ts = parts.ts;
  const hash = parts.v1;

  if (!ts || !hash) {
    return res.status(401).json({ error: 'Malformed x-signature header' });
  }

  const manifest = 'id:' + dataId + ';request-id:' + xRequestId + ';ts:' + ts + ';';
  const hmac = crypto.createHmac('sha256', mpWebhookSecret).update(manifest).digest('hex');

  if (hmac !== hash) {
    return res.status(401).json({ error: 'Invalid webhook signature' });
  }

  try {
    const body = req.body;

    // Suscripcion recurrente
    if (body.type === 'preapproval' && body.data && body.data.id) {
      const preapprovalId = body.data.id;

      const subRes = await pool.query(
        'SELECT * FROM billing_subscription WHERE mp_preapproval_id = $1',
        [preapprovalId]
      );

      const sub = subRes.rows[0];
      if (!sub) return res.status(200).send('OK');

      await pool.query(
        "UPDATE billing_subscription SET status = 'active' WHERE mp_preapproval_id = $1",
        [preapprovalId]
      );

      await activateTierForCliente(sub.cliente_id, sub.tier_id);

      return res.status(200).send('OK');
    }

    // Pago unico (promo)
    if (body.type === 'payment' && body.data && body.data.id) {
      const paymentId = body.data.id;

      const paymentRes = await fetch('https://api.mercadopago.com/v1/payments/' + paymentId, {
        headers: {
          Authorization: 'Bearer ' + process.env.MERCADOPAGO_ACCESS_TOKEN,
        },
      });

      const payment = await paymentRes.json();
      if (payment.status !== 'approved') return res.status(200).send('IGNORED');

      const metadata = payment.metadata;
      if (!metadata || metadata.tipo !== 'pago_unico') return res.status(200).send('IGNORED');

      const rawRef = payment.external_reference || '';
      const clienteId = rawRef.startsWith('cliente-') ? rawRef.replace('cliente-', '') : rawRef || null;
      const tierId = metadata.tier_id;
      const duracionMeses = metadata.duracion_meses || 1;

      if (!clienteId || !tierId) return res.status(200).send('MISSING DATA');

      await activateTierForCliente(clienteId, tierId, { meses: Number(duracionMeses) || 1 });

      return res.status(200).send('OK');
    }

    res.status(200).send('IGNORED');
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
