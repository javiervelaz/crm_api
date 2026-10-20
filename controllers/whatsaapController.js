const svc = require('../services/whatsaap/whatsappService');

// Todo es del tenant del JWT (req.clienteId, lo setea scopeTenant). Nada de
// :cliente_id en paths (WA-06) y nada de access_token en respuestas (WA-05).

const fail = (res, err, tag) => {
  if (!err.status || err.status >= 500) console.error(`[WA] ${tag}:`, err.message);
  const status = err.status || 500;
  return res.status(status).json({
    error: status >= 500 && status !== 502 ? 'Error interno' : err.message,
    code: err.code,
  });
};

/** Flujo SMS viejo: retirado hasta Embedded Signup (W2). */
const gone = (req, res) => res.status(410).json({
  error: 'El alta de números por SMS fue retirada. Próximamente: conectar WhatsApp desde Counter.',
  code: 'GONE',
});

const getAccounts = async (req, res) => {
  try {
    return res.json(await svc.getAccountsByClienteId(req.clienteId));
  } catch (err) { return fail(res, err, 'getAccounts'); }
};

const getTemplates = async (req, res) => {
  try {
    return res.json(await svc.getTemplatesByClienteId(req.clienteId));
  } catch (err) { return fail(res, err, 'getTemplates'); }
};

const getLog = async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    return res.json(await svc.getConversationsByClienteId(req.clienteId, { limit, offset }));
  } catch (err) { return fail(res, err, 'getLog'); }
};

const sendText = async (req, res) => {
  try {
    const { phone_number_id, to, body } = req.body || {};
    if (!phone_number_id || !to || !body) {
      return res.status(400).json({ error: 'phone_number_id, to y body son requeridos' });
    }
    const data = await svc.sendTextMessage({ cliente_id: req.clienteId, wa_phone_id: phone_number_id, to, body });
    return res.json(data);
  } catch (err) { return fail(res, err, 'sendText'); }
};

const sendTemplate = async (req, res) => {
  try {
    const { phone_number_id, to, template_name, language, components } = req.body || {};
    if (!phone_number_id || !to || !template_name) {
      return res.status(400).json({ error: 'phone_number_id, to y template_name son requeridos' });
    }
    const data = await svc.sendTemplateMessage({
      cliente_id: req.clienteId, wa_phone_id: phone_number_id, to, template_name, language, components,
    });
    return res.json(data);
  } catch (err) { return fail(res, err, 'sendTemplate'); }
};

module.exports = { gone, getAccounts, getTemplates, getLog, sendText, sendTemplate };
