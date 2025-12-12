// crm_api/services/billing/mercadoPagoService.js
const pool = require('../../pool');
const { MercadoPagoConfig, PreApproval, Preference } = require('mercadopago');

const USE_MOCK = process.env.MP_MOCK === 'true';

// CONFIG REAL MP
let mpClient = null;
let preapproval = null;
let preference = null;

if (!USE_MOCK) {
  mpClient = new MercadoPagoConfig({
    accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN,
    options: { timeout: 5000 }
  });
  preapproval = new PreApproval(mpClient);
  preference = new Preference(mpClient);
}

// Email de sandbox para evitar error "different countries"
const TEST_PAYER_EMAIL =
  process.env.MERCADOPAGO_TEST_PAYER_EMAIL || 'test@testuser.com';

/**
 * CREATE SUBSCRIPTION (REAL OR MOCK)
 */
async function createSubscription(cliente, tier) {
  if (USE_MOCK) {
    const fakeId = `mock-preapproval-${Date.now()}`;
    console.log('[MP MOCK] createSubscription called:', {
      cliente: cliente.id,
      tier: tier.code,
      fakeId,
    });

    return {
      preapprovalId: fakeId,
      initPoint: `https://fake-mp-checkout.com/pay/${fakeId}`,
    };
  }

  const payerEmail = cliente.contacto_email;

  const data = {
    reason: `Suscripción plan ${tier.code}`,
    external_reference: `cliente-${cliente.id}-tier-${tier.id}`,
    payer_email: payerEmail,
    back_url: process.env.FRONTEND_SUCCESS_URL || 'https://google.com',
    auto_recurring: {
      frequency: 1,
      frequency_type: 'months',
      transaction_amount: Number(tier.precio_mensual),
      currency_id: 'ARS',
    },
  };

  console.log('[MP] PreApproval body to send:', data);
  try {
    const response = await preapproval.create({ body: data });
    return {
      preapprovalId: response.id || response.body?.id,
      initPoint: response.init_point || response.body?.init_point,
    };
  } catch (err) {
    console.error('[MP] Error creando preapproval:', err.response?.data || err.message);
    throw err;
  }
}

/**
 * CREATE ONE-TIME PAYMENT (PROMO PLAN)
 */
async function createOneTimePayment(cliente, tier) {
  if (USE_MOCK) {
    const fakeId = `mock-payment-${Date.now()}`;
    console.log('[MP MOCK] createOneTimePayment called:', {
      cliente: cliente.id,
      tier: tier.code,
      fakeId,
    });

    return {
      paymentId: fakeId,
      initPoint: `https://fake-mp-checkout.com/pay/${fakeId}`,
    };
  }

  const data = {
    items: [
      {
        title: `Plan ${tier.nombre}`,
        quantity: 1,
        currency_id: 'ARS',
        unit_price: Number(tier.precio_mensual),
      },
    ],
    back_urls: {
      success: process.env.FRONTEND_SUCCESS_URL,
      failure: process.env.FRONTEND_FAILURE_URL,
    },
    auto_return: 'approved',
    payer: {
      email: TEST_PAYER_EMAIL,
    },
    metadata: {
      tipo: 'pago_unico',
      tier_id: tier.id,
      duracion_meses: tier.duracion_meses,
    },
  };

  try {
    const response = await preference.create({ body: data });
    return {
      paymentId: response.id || response.body?.id,
      initPoint: response.init_point || response.body?.init_point,
    };
  } catch (err) {
    console.error('[MP] Error creando preference:', err.response?.data || err.message);
    throw err;
  }
}

/**
 * SAVE SUBSCRIPTION IN DB
 */
async function saveSubscription(clienteId, tierId, preapprovalId) {
  await pool.query(
    `
    INSERT INTO billing_subscription (cliente_id, tier_id, mp_preapproval_id, status)
    VALUES ($1, $2, $3, 'pending')
    `,
    [clienteId, tierId, preapprovalId]
  );
}

/**
 * ACTIVATE PLAN FOR THE CLIENTE
 */
async function activateTierForCliente(clienteId, tierId) {
  await pool.query(
    `
    UPDATE cliente
    SET tier_id = $1, updated_at = NOW()
    WHERE id = $2
    `,
    [tierId, clienteId]
  );
}

/**
 * MOCK WEBHOOK HANDLER (ONLY WHEN MP_MOCK=true)
 */
async function simulateWebhook(preapprovalId) {
  console.log('[MP MOCK] simulateWebhook triggered:', preapprovalId);

  const subRes = await pool.query(
    `SELECT * FROM billing_subscription WHERE mp_preapproval_id = $1`,
    [preapprovalId]
  );

  const sub = subRes.rows[0];
  if (!sub) {
    console.log('[MP MOCK] Subscription not found.');
    return;
  }

  // marcar activa
  await pool.query(
    `UPDATE billing_subscription SET status = 'active' WHERE mp_preapproval_id = $1`,
    [preapprovalId]
  );

  // activar plan
  await activateTierForCliente(sub.cliente_id, sub.tier_id);

  console.log('[MP MOCK] Subscription activated successfully.');
}

module.exports = {
  createSubscription,
  createOneTimePayment,
  saveSubscription,
  activateTierForCliente,
  simulateWebhook,
  USE_MOCK,
};
