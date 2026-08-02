// middleware/tenantMiddleware.js — versión que funciona montada global

function parseId(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

const scopeTenant = (req, res, next) => {
  const jwtClienteId = parseId(req.user?.cliente_id);
  if (!jwtClienteId) {
    return res.status(403).json({ error: 'Usuario sin cliente asociado', code: 'NO_TENANT' });
  }

  const violation = (origen, raw) => {
    console.warn(
      `[TENANT VIOLATION] user=${req.user.userId} jwt=${jwtClienteId} ` +
      `declarado=${raw} origen=${origen} ip=${req.ip} ${req.method} ${req.originalUrl}`
    );
    return res.status(403).json({ error: 'Acceso denegado al recurso solicitado', code: 'TENANT_MISMATCH' });
  };

  // body y query: disponibles siempre
  for (const [origen, raw] of [['body', req.body?.cliente_id], ['query', req.query?.cliente_id]]) {
    if (raw == null || raw === '') continue;
    if (parseId(raw) !== jwtClienteId) return violation(origen, raw);
  }

  // Path: cualquier segmento numérico que no sea el del tenant es sospechoso
  // sólo si la ruta declara :cliente_id. Como no lo sabemos acá, aplicamos
  // la regla inversa: fail-closed en el router (ver abajo).
  req.clienteId = jwtClienteId;

  if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
    req.body.cliente_id = jwtClienteId;
  }

  next();
};

/**
 * Se monta DENTRO de cada router, donde req.params ya está poblado.
 * router.use(enforceParamTenant) al tope de cada archivo de routes.
 */
const enforceParamTenant = (req, res, next) => {
  const raw = req.params?.cliente_id;
  if (raw == null || raw === '') return next();

  if (parseId(raw) !== req.clienteId) {
    console.warn(
      `[TENANT VIOLATION param] user=${req.user?.userId} jwt=${req.clienteId} ` +
      `declarado=${raw} ip=${req.ip} ${req.method} ${req.originalUrl}`
    );
    return res.status(403).json({ error: 'Acceso denegado al recurso solicitado', code: 'TENANT_MISMATCH' });
  }
  next();
};

module.exports = { scopeTenant, enforceParamTenant };