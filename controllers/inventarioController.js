// controllers/inventarioController.js
// Tenant y usuario salen siempre del request autenticado (scopeTenant / JWT),
// nunca del body ni de la URL.
const inventarioService = require('../services/inventario/inventarioService');
const recetaService = require('../services/inventario/recetaService');

const responderError = (res, next, err) => {
  if (err && err.status && err.status < 500) {
    return res.status(err.status).json({ error: err.message, code: err.code || null });
  }
  return next(err);
};

const handler = (fn, status = 200) => async (req, res, next) => {
  try {
    res.status(status).json(await fn(req));
  } catch (err) {
    responderError(res, next, err);
  }
};

const listarItems = handler((req) => inventarioService.listarItems(req.clienteId, req.query));
const obtenerItem = handler((req) => inventarioService.obtenerItem(req.clienteId, Number(req.params.id)));
const crearItem = handler((req) => inventarioService.crearItem(req.clienteId, req.body), 201);
const actualizarItem = handler((req) => inventarioService.actualizarItem(req.clienteId, Number(req.params.id), req.body));
const desactivarItem = handler((req) => inventarioService.desactivarItem(req.clienteId, Number(req.params.id)));

const registrarMovimiento = handler(
  (req) => inventarioService.registrarMovimiento(req.clienteId, req.user?.userId, req.body),
  201
);
const listarMovimientos = handler((req) => inventarioService.listarMovimientos(req.clienteId, req.query));
const listarAlertas = handler((req) => inventarioService.listarAlertas(req.clienteId));

// Recetas (Fase 2). requireFeature deja las features del plan en req.clienteTier.
const listarRecetas = handler((req) => recetaService.listarProductos(req.clienteId));
const obtenerReceta = handler((req) => recetaService.obtener(req.clienteId, Number(req.params.id)));
const guardarReceta = handler((req) =>
  recetaService.guardar(req.clienteId, Number(req.params.id), req.body, req.clienteTier?.features || {})
);

module.exports = {
  listarItems,
  obtenerItem,
  crearItem,
  actualizarItem,
  desactivarItem,
  registrarMovimiento,
  listarMovimientos,
  listarAlertas,
  listarRecetas,
  obtenerReceta,
  guardarReceta,
};
