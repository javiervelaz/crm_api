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

 // createSubscription — el email real gana; el de test sólo en sandbox
const payerEmail = USE_MOCK || process.env.NODE_ENV !== 'production'
  ? (process.env.MERCADOPAGO_TEST_PAYER_EMAIL || cliente.contacto_email)
  : cliente.contacto_email;

  if (!payerEmail) {
    throw new Error(`Cliente ${cliente.id} sin contacto_email — no se puede crear la suscripción`);
  }

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
    console.error('[MP] Error creando preapproval:', JSON.stringify(err.cause || err.apiResponse || err.response?.data || err, null, 2));
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

  const payerEmail = cliente.contacto_email || process.env.MERCADOPAGO_TEST_PAYER_EMAIL;

  const data = {
    items: [
      {
        title: `Plan ${tier.nombre}`,
        quantity: 1,
        currency_id: 'ARS',
        unit_price: Number(tier.precio_mensual),
      },
    ],
    external_reference: `cliente-${cliente.id}`,
    back_urls: {
      success: `${process.env.PLATFORM_BASE_URL}/auth/pago?status=success`,
      failure: `${process.env.PLATFORM_BASE_URL}/auth/pago?status=failure`,
      pending: `${process.env.PLATFORM_BASE_URL}/auth/pago?status=pending`,
    },
    auto_return: 'approved',
    notification_url: process.env.MERCADOPAGO_WEBHOOK_URL || undefined,
    payer: {
      email: payerEmail,
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
      sandboxInitPoint: response.sandbox_init_point || response.body?.sandbox_init_point,
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


const TZ = 'America/Argentina/Cordoba';

/**
 * Activa el tier y setea la fecha de vencimiento.
 * Sin la fecha, el enforcement de la Fase 2 nunca corta:
 * planStatus queda ACTIVE para siempre.
 */
async function activateTierForCliente(clienteId, tierId, { meses } = {}) {
  const { rows } = await pool.query(
    `SELECT duracion_meses FROM tier WHERE id = $1`, [tierId]
  );
  // Suscripción recurrente: 1 mes por ciclo. Pago único: lo que diga el tier.
  const duracion = meses ?? (Number(rows[0]?.duracion_meses) || 1);

  await pool.query(
    `UPDATE cliente
        SET tier_id              = $1,
            tier_expiration_date = GREATEST(
              COALESCE(tier_expiration_date, (now() AT TIME ZONE $4)::date),
              (now() AT TIME ZONE $4)::date
            ) + ($2 || ' months')::interval,
            tier_downgraded_at   = NULL,
            updated_at           = now()
      WHERE id = $3`,
    [tierId, duracion, clienteId, TZ]
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
