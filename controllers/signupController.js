// controllers/signupController.js
const ClienteService = require('../services/cliente/clienteService');
const {
  createSubscription, createOneTimePayment, saveSubscription,
} = require('../services/billing/mercadoPagoService');
const mailer = require('../services/email');
const { waitUntil } = require('@vercel/functions');

const TERMINOS_VERSION = process.env.TERMINOS_VERSION || '2026-07';

const signup = async (req, res) => {
  const {
    comercioNombre, cuit, adminNombre, adminApellido, adminEmail,
    adminDni, telefono, password, plan, utmSource, utmCampaign,
  } = req.body;

  let provisioned;

  // ─── Paso 1: provisioning transaccional ───────────────────────────────
  // El mail de bienvenida se encola acá adentro (clienteService): si el COMMIT
  // sale, el mail de activación está garantizado.
  try {
    provisioned = await ClienteService.createClienteService({
      nombre: comercioNombre,
      cuit,
      adminNombre,
      adminApellido,
      adminEmail,
      adminDni,
      telefono,
      adminPassword: password,
      plan,
      canal_alta: 'landing',
      terminosVersion: TERMINOS_VERSION,
      signupIp: req.ip,
      utmSource,
      utmCampaign,
    });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message, code: err.code, field: err.field });
    }
    console.error('[signup] provisioning:', err);
    return res.status(500).json({ error: 'No pudimos crear tu cuenta. Intentá de nuevo en unos minutos.' });
  }

  const { cliente, tier, esPago } = provisioned;

  // ─── Paso 2: checkout, si el plan es pago ─────────────────────────────
  // A partir de acá la cuenta existe. Nada de lo que sigue puede fallar el
  // request: el usuario ya es cliente.
  let paymentUrl = null;
  let paymentError = null;

  if (esPago) {
    try {
      const paymentType = Number(tier.duracion_meses) > 0 ? 'one_time' : 'subscription';

      if (paymentType === 'subscription') {
        const { initPoint, preapprovalId } = await createSubscription(cliente, tier);
        await saveSubscription(cliente.id, tier.id, preapprovalId);
        paymentUrl = initPoint;
      } else {
        const { initPoint, sandboxInitPoint } = await createOneTimePayment(cliente, tier);
        paymentUrl = process.env.MP_MOCK === 'true' ? (sandboxInitPoint || initPoint) : initPoint;
      }
    } catch (err) {
      console.error(`[signup] MercadoPago falló para cliente ${cliente.id}:`, err.message);
      // La cuenta queda creada en FREE efectivo (tier pago vencido).
      // Puede pagar después desde /dashboard/plan.
      paymentError = 'No pudimos iniciar el pago. Podés hacerlo desde tu panel.';
    }
  }

  // ─── Paso 3: drenar la cola sin bloquear la respuesta ─────────────────
  // waitUntil le dice a Vercel que no congele la lambda hasta que la promesa
  // resuelva. Sin esto la ejecución se corta al responder y el mail no sale:
  // era exactamente el bug del fire-and-forget anterior.
  //
  // Si igual falla, la fila queda 'pending' en email_outbox y la levanta el
  // drenado periódico. El mail no se pierde.
  waitUntil(
    mailer.drain({ limit: 5 }).catch((err) => {
      console.error(`[signup] drain del outbox falló (cliente ${cliente.id}):`, err.message);
    })
  );

  // ─── Respuesta ────────────────────────────────────────────────────────
  // NO se devuelve token. Con el gate de activación, dar sesión a quien todavía
  // no confirmó el mail vacía de sentido al gate: entraría igual y recién
  // toparía con el 403 al vencerle el JWT.
  return res.status(201).json({
    cliente: { id: cliente.id, nombre: cliente.nombre, cuit: cliente.cuit },
    adminUser: provisioned.adminUser,
    plan: { code: tier.code, nombre: tier.nombre_publico, esPago },
    requiereVerificacion: true,
    emailVerificacion: provisioned.adminUser.email,
    paymentUrl,
    ...(paymentError && { paymentWarning: paymentError }),
  });
};

module.exports = { signup };
