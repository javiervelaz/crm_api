const svc = require('../services/whatsaap/whatsappService');

// ─── Alta de número ───────────────────────────────────────────────────────────

/**
 * POST /api/whatsapp/request-code
 * Body: { cliente_id, cc, phone_number, verified_name }
 * Solicita SMS de verificación a Meta y devuelve el phone_number_id
 */
// Paso 1: request-code ahora recibe phone_number_id directamente
const requestCode = async (req, res) => {
  try {
    const { cc, phone_number, verified_name, method } = req.body;
    if (!cc || !phone_number || !verified_name) {
      return res.status(400).json({ 
        error: 'cc, phone_number y verified_name son requeridos' 
      });
    }
    const data = await svc.requestVerificationCode({ 
      cc, phone_number, verified_name, method 
    });
    return res.json({ phone_number_id: data.id });
  } catch (err) {
    console.error('[WA] requestCode error:', err);
    return res.status(err.status || 500).json({ error: err.meta || err.message });
  }
};

/**
 * POST /api/whatsapp/activate
 * Body: { cliente_id, phone_number_id, verified_name, display_phone, code }
 * Verifica el código SMS y activa el número en Cloud API + DB
 */
const activate = async (req, res) => {
  try {
    const { cliente_id, phone_number_id, verified_name, display_phone, code } = req.body;
    if (!cliente_id || !phone_number_id || !code) {
      return res.status(400).json({ error: 'cliente_id, phone_number_id y code son requeridos' });
    }

    // Verificar código con Meta
    await svc.verifyCode(phone_number_id, code);

    // Activar: register en Cloud API + DB + template
    const account = await svc.activateWhatsappNumber({
      cliente_id,
      phone_number_id,
      verified_name,
      display_phone,
    });

    return res.json({ success: true, account });
  } catch (err) {
    console.error('[WA] activate error:', err);
    return res.status(err.status || 500).json({ error: err.meta || err.message });
  }
};

// ─── Resolución de cliente (para n8n) ────────────────────────────────────────

/**
 * GET /api/whatsapp/resolve/:phone_number_id
 * Devuelve { cliente_id, waba_id, phone_number_id, access_token, ... }
 * Usado por el webhook de n8n para identificar al cliente
 */
const resolve = async (req, res) => {
  try {
    const { phone_number_id } = req.params;
    const result = await svc.resolveClienteByPhoneId(phone_number_id);
    if (!result) {
      return res.status(404).json({ error: 'No se encontró cuenta activa para ese phone_number_id' });
    }
    return res.json(result);
  } catch (err) {
    console.error('[WA] resolve error:', err);
    return res.status(500).json({ error: err.message });
  }
};

// ─── Listados ─────────────────────────────────────────────────────────────────

/**
 * GET /api/whatsapp/accounts/:cliente_id
 */
const getAccounts = async (req, res) => {
  try {
    const accounts = await svc.getAccountsByClienteId(req.params.cliente_id);
    return res.json(accounts);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

/**
 * GET /api/whatsapp/templates/:cliente_id
 */
const getTemplates = async (req, res) => {
  try {
    const templates = await svc.getTemplatesByClienteId(req.params.cliente_id);
    return res.json(templates);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

/**
 * GET /api/whatsapp/log/:cliente_id?limit=50&offset=0
 */
const getLog = async (req, res) => {
  try {
    const { limit, offset } = req.query;
    const log = await svc.getMessageLog(req.params.cliente_id, {
      limit:  parseInt(limit  || '50'),
      offset: parseInt(offset || '0'),
    });
    return res.json(log);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// ─── Envío de mensajes ────────────────────────────────────────────────────────

/**
 * POST /api/whatsapp/send/text
 * Body: { phone_number_id, to, body }
 */
const sendText = async (req, res) => {
  try {
    const { phone_number_id, to, body } = req.body;
    if (!phone_number_id || !to || !body) {
      return res.status(400).json({ error: 'phone_number_id, to y body son requeridos' });
    }
    const data = await svc.sendTextMessage({ wa_phone_id: phone_number_id, to, body });
    return res.json(data);
  } catch (err) {
    console.error('[WA] sendText error:', err);
    return res.status(err.status || 500).json({ error: err.meta || err.message });
  }
};

/**
 * POST /api/whatsapp/send/template
 * Body: { phone_number_id, to, template_name, language?, components? }
 */
const sendTemplate = async (req, res) => {
  try {
    const { phone_number_id, to, template_name, language, components } = req.body;
    if (!phone_number_id || !to || !template_name) {
      return res.status(400).json({ error: 'phone_number_id, to y template_name son requeridos' });
    }
    const data = await svc.sendTemplateMessage({ phone_number_id, to, template_name, language, components });
    return res.json(data);
  } catch (err) {
    console.error('[WA] sendTemplate error:', err);
    return res.status(err.status || 500).json({ error: err.meta || err.message });
  }
};

module.exports = {
  requestCode,
  activate,
  resolve,
  getAccounts,
  getTemplates,
  getLog,
  sendText,
  sendTemplate,
};
