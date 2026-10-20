// controllers/internalWhatsappController.js
//
// Endpoints que llama n8n (handoff-ingreso) con token de servicio. El tenant
// NUNCA viene del body: se deriva del phone_number_id que recibió el mensaje.
const waDb = require('../model/whatsaap/db');
const planService = require('../services/cliente/planService');
const { signHandoff, micrositioUrl } = require('../services/whatsaap/handoffService');

const PHONE_ID_RE = /^\d{5,25}$/;
const TELEFONO_RE = /^\d{8,15}$/;

/**
 * Middleware: carga la cuenta por phone_number_id (path o body) y fija
 * req.clienteId. Corre ANTES de withTenantConnection: whatsapp_bot_cliente no
 * tiene RLS y es la tabla que define el tenant.
 */
const cargarCuenta = (origen) => async (req, res, next) => {
  try {
    const raw = origen === 'params' ? req.params.phone_number_id : req.body?.wa_phone_id;
    const waPhoneId = raw == null ? '' : String(raw).trim();
    if (!PHONE_ID_RE.test(waPhoneId)) {
      return res.status(400).json({ error: 'phone_number_id inválido', code: 'INVALID_PARAM' });
    }
    const cuenta = await waDb.getAccountByPhoneId(waPhoneId);
    if (!cuenta) {
      return res.status(404).json({ error: 'Número no registrado', code: 'WA_NUMBER_UNKNOWN', activo: false });
    }
    req.waCuenta = cuenta;
    req.clienteId = Number(cuenta.cliente_id);
    return next();
  } catch (err) {
    console.error('[internal/wa] cargarCuenta:', err.message);
    return res.status(500).json({ error: 'Error interno' });
  }
};

const planDe = async (clienteId) => {
  const plan = await planService.getClienteTierAndFeatures(clienteId);
  return { ...plan, ok: !plan.isExpired && Boolean(plan.features.canUseWhatsappBot) };
};

/** GET /api/internal/whatsapp/resolve/:phone_number_id */
const resolve = async (req, res) => {
  try {
    const c = req.waCuenta;
    const plan = await planDe(req.clienteId);
    return res.json({
      cliente_id: req.clienteId,
      cliente_nombre: plan.clienteNombre,
      wa_phone_id: c.wa_phone_id,
      wa_display: c.wa_display,
      status: c.status,
      plan_ok: plan.ok,
      activo: c.status === 'active' && plan.ok,
    });
  } catch (err) {
    console.error('[internal/wa] resolve:', err.message);
    return res.status(500).json({ error: 'Error interno' });
  }
};

/**
 * POST /api/internal/whatsapp/handoff/sign
 * Body: { wa_phone_id, telefono, wa_message_id? }
 * Upsert de la conversación + token del micrositio + URL lista para mandar.
 * 403 PLAN_INACTIVE / WA_NUMBER_INACTIVE → n8n no responde nada.
 */
const sign = async (req, res) => {
  try {
    const c = req.waCuenta;
    if (c.status !== 'active') {
      return res.status(403).json({ error: `Número ${c.status}`, code: 'WA_NUMBER_INACTIVE', enviar: false });
    }
    const plan = await planDe(req.clienteId);
    if (!plan.ok) {
      return res.status(403).json({ error: 'El plan del comercio no incluye el bot', code: 'PLAN_INACTIVE', enviar: false });
    }

    const telefono = String(req.body?.telefono ?? '').replace(/\D/g, '');
    if (!TELEFONO_RE.test(telefono)) {
      return res.status(400).json({ error: 'telefono inválido', code: 'INVALID_PARAM' });
    }

    // Reintento de Meta del mismo mensaje → no se contesta dos veces
    const waMessageId = req.body?.wa_message_id ? String(req.body.wa_message_id).slice(0, 200) : null;
    if (waMessageId && !(await waDb.registrarMensajeEntrante(waMessageId))) {
      return res.json({ enviar: false, motivo: 'DUPLICADO' });
    }

    const conversationId = await waDb.findOrCreateConversation({
      cliente_id: req.clienteId,
      wa_phone_id: c.wa_phone_id,
      phone_e164: telefono,
    });

    const { token, expiresIn } = signHandoff({
      clienteId: req.clienteId,
      conversationId: Number(conversationId),
      waPhoneId: c.wa_phone_id,
      userPhoneE164: telefono,
    });

    return res.json({
      enviar: true,
      token,
      expiresIn,
      url: micrositioUrl(token),
      conversation_id: Number(conversationId),
      cliente_nombre: plan.clienteNombre,
    });
  } catch (err) {
    console.error('[internal/wa] sign:', err.message);
    return res.status(500).json({ error: 'Error interno' });
  }
};

module.exports = { cargarCuenta, resolve, sign };
