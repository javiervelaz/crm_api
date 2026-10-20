// controllers/micrositioController.js
const svc = require('../services/micrositio/micrositioService');

const fail = (res, err, tag) => {
  const status = err.status || 500;
  if (status >= 500) console.error(`[micrositio] ${tag}:`, err.message);
  return res.status(status).json({
    error: status >= 500 ? 'Error interno' : err.message,
    code: err.code,
  });
};

const sesion = (req, res) => {
  const now = Math.floor(Date.now() / 1000);
  const exp = req.handoff.exp ?? null;
  return res.json({
    valid: true,
    clienteId: req.clienteId,
    userPhoneE164: req.handoff.userPhoneE164 ?? null,
    conversationId: req.handoff.conversationId ?? null,
    exp,
    expiresIn: exp ? exp - now : null,
  });
};

const productos = async (req, res) => {
  try { return res.json(await svc.listarProductos(req.clienteId)); } catch (err) { return fail(res, err, 'productos'); }
};

const producto = async (req, res) => {
  try {
    const p = await svc.obtenerProducto(req.clienteId, req.params.id);
    if (!p) return res.status(404).json({ error: 'Producto no encontrado' });
    return res.json(p);
  } catch (err) { return fail(res, err, 'producto'); }
};

const mediosPago = async (req, res) => {
  try { return res.json(await svc.listarMediosPago()); } catch (err) { return fail(res, err, 'medios-pago'); }
};

const caja = async (req, res) => {
  try { return res.json(await svc.estadoCaja(req.clienteId)); } catch (err) { return fail(res, err, 'caja'); }
};

const crearPedido = async (req, res) => {
  try {
    const r = await svc.crearPedido(req.clienteId, req.handoff, req.body);
    return res.status(201).json({ status: 'OK', ...r });
  } catch (err) { return fail(res, err, 'crearPedido'); }
};

module.exports = { sesion, productos, producto, mediosPago, caja, crearPedido };
