// controllers/signupController.js
const ClienteService = require('../services/cliente/clienteService');
const userService = require('../services/user/userService');
const { issueToken, TTL } = require('../services/auth/tokenService');
const { createSubscription, createOneTimePayment, saveSubscription } =
  require('../services/billing/mercadoPagoService');
const { sendWelcomeEmail } = require('../services/email/emailService');

const TERMINOS_VERSION = process.env.TERMINOS_VERSION || '2026-07';

const signup = async (req, res) => {
  const {
    comercioNombre, cuit, adminNombre, adminApellido, adminEmail,
    adminDni, telefono, password, plan, utmSource, utmCampaign,
  } = req.body;

  let provisioned;

  // ─── Paso 1: provisioning transaccional ───────────────────────────────
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

  const { cliente, tier, esPago, adminUser, verificationToken } = provisioned;

  // ─── Paso 2: sesión inmediata ─────────────────────────────────────────
  // A partir de acá la cuenta existe. Nada de lo que sigue puede fallar
  // el request: el usuario ya es cliente.
  let token = null;
  try {
    const authed = await userService.authenticate(adminUser.email, password);
    if (authed && !authed.error) token = issueToken(authed);
  } catch (err) {
    console.error(`[signup] auto-login falló para cliente ${cliente.id}:`, err.message);
  }

  // ─── Paso 3: checkout, si el plan es pago ─────────────────────────────
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

  // ─── Paso 4: email, best-effort, sin await bloqueante ─────────────────
  const verifyUrl = `${process.env.PLATFORM_BASE_URL}/auth/verificar?token=${verificationToken}`;
  sendWelcomeEmail({
    to: adminUser.email,
    nombreComercio: cliente.nombre,
    nombreContacto: adminUser.nombre,
    plan: tier.code,
    urlLogin: `${process.env.PLATFORM_BASE_URL}/`,
    urlVerificacion: verifyUrl,
  }).catch((err) => {
    console.error(`[signup] email falló para cliente ${cliente.id} (${adminUser.email}):`, err.message);
  });

  return res.status(201).json({
    cliente: { id: cliente.id, nombre: cliente.nombre, cuit: cliente.cuit },
    adminUser,
    plan: { code: tier.code, nombre: tier.nombre_publico, esPago },
    token,
    expiresIn: TTL,
    paymentUrl,
    ...(paymentError && { paymentWarning: paymentError }),
  });
};

module.exports = { signup };