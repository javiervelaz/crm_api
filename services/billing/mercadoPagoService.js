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
    back_url: process.env.FRONTEND_SUCCESS_URL || `${process.env.PLATFORM_BASE_URL}/auth/pago?status=success`,
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
    // Sin notification_url: el aviso va a la URL configurada en el panel de MP
    // (Webhooks → Pagos), la misma que usan las suscripciones. Con dos fuentes
    // (panel + env) bastaba que una se desactualizara para perder pagos únicos
    // en silencio (capa 2, caso 3).
    payer: {
      email: payerEmail,
    },
    metadata: {
      tipo: 'pago_unico',
      tier_id: tier.id,
      duracion_meses: tier.duracion_meses,
      rubro_codigo: tier.rubro_codigo ?? null,
      precio: Number(tier.precio_mensual),
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
/**
 * Guarda la suscripción con el snapshot de lo contratado. El monto del
 * preapproval queda fijo en MercadoPago hasta que la suscripción termina:
 * un cambio de precio del rubro sólo aplica a suscripciones nuevas.
 * `tier` es la oferta del rubro (planService.getOferta).
 */
async function saveSubscription(clienteId, tierId, preapprovalId, tier = {}) {
  await pool.query(
    `
    INSERT INTO billing_subscription
      (cliente_id, tier_id, mp_preapproval_id, status, rubro_codigo, precio_mensual, duracion_meses)
    VALUES ($1, $2, $3, 'pending', $4, $5, $6)
    `,
    [clienteId, tierId, preapprovalId, tier.rubro_codigo ?? null,
      tier.precio_mensual != null ? Number(tier.precio_mensual) : null,
      tier.duracion_meses != null ? Number(tier.duracion_meses) : null]
  );
}

/**
 * Registra un pago aprobado (pago único o cobro mensual de una suscripción),
 * idempotente por el id real del pago en MP. Devuelve false si ya estaba
 * registrado (reintento del webhook): el plan NO se vuelve a extender.
 */
async function registrarPago({
  clienteId, tierId, rubroCodigo, mpPaymentId, monto, duracionMeses,
  origen = 'pago_unico', mpPreapprovalId = null,
}) {
  const r = await pool.query(
    `INSERT INTO billing_pago (cliente_id, tier_id, rubro_codigo, mp_payment_id, monto, duracion_meses, origen, mp_preapproval_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (mp_payment_id) DO NOTHING
     RETURNING id`,
    [clienteId, tierId, rubroCodigo ?? null, String(mpPaymentId), Number(monto) || 0,
      Number(duracionMeses) || 1, origen, mpPreapprovalId]
  );
  return r.rows.length > 0;
}

const registrarPagoUnico = (args) => registrarPago({ ...args, origen: 'pago_unico' });

/**
 * Compensación: si después de registrar el pago falla la activación del plan,
 * se borra el registro para que el reintento de MP lo vuelva a procesar.
 * Sin esto el reintento responde ALREADY PROCESSED y el plan no se activa nunca.
 */
async function anularRegistroPago(mpPaymentId) {
  await pool.query('DELETE FROM billing_pago WHERE mp_payment_id = $1', [String(mpPaymentId)]);
}

/**
 * Suscripción: el plan queda cubierto hasta `fechaBase + 1 mes` (en la zona
 * del comercio). No suma: si llegan el alta del preapproval y el primer cobro
 * el mismo día, o el mismo evento dos veces, el vencimiento es el mismo.
 * Nunca acorta un vencimiento más largo que ya tenga (p. ej. un anual).
 *
 * Tampoco baja de plan: si el plan vigente vence DESPUÉS del período que cubre
 * este cobro (p. ej. pagó un anual y una mensual vieja siguió cobrando), el
 * tier_id no cambia. El plan lo define lo que vence último.
 */
async function cubrirPeriodo(clienteId, tierId, fechaBase = new Date()) {
  const base = new Date(fechaBase);
  const iso = Number.isNaN(base.getTime()) ? new Date().toISOString() : base.toISOString();
  await pool.query(
    `WITH p AS (
       SELECT id,
              ((($3::timestamptz) AT TIME ZONE timezone)::date + interval '1 month')::date AS hasta
         FROM cliente WHERE id = $2
     )
     UPDATE cliente c
        SET tier_id              = CASE
                                     WHEN c.tier_expiration_date IS NULL
                                       OR c.tier_expiration_date <= p.hasta THEN $1
                                     ELSE c.tier_id
                                   END,
            tier_expiration_date = GREATEST(
              COALESCE(c.tier_expiration_date, (now() AT TIME ZONE c.timezone)::date),
              p.hasta
            ),
            updated_at           = now()
       FROM p
      WHERE c.id = p.id`,
    [tierId, clienteId, iso]
  );
}

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
              COALESCE(tier_expiration_date, (now() AT TIME ZONE timezone)::date),
              (now() AT TIME ZONE timezone)::date
            ) + ($2 || ' months')::interval,
            updated_at           = now()
      WHERE id = $3`,
    [tierId, duracion, clienteId]
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
  registrarPago,
  registrarPagoUnico,
  anularRegistroPago,
  cubrirPeriodo,
  activateTierForCliente,
  simulateWebhook,
  USE_MOCK,
};
