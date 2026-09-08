// middleware/tenantMiddleware.js
//
// Aislamiento multi-tenant. Dos piezas:
//  - scopeTenant: se monta global en /api. Deriva el cliente_id del JWT
//    (fuente de verdad), valida body/query y lo fuerza en el body.
//  - registerTenantGuards(router): se llama al tope de cada router de tenant.
//    Registra guards de router.param para :cliente_id y :id, que SÍ ven el
//    valor del segmento (a diferencia de un router.use, donde req.params aún
//    no está poblado — ese era el bug: el guard nunca se ejecutaba y las
//    rutas cross-tenant devolvían 200 en vez de 403; sólo el RLS de Postgres
//    frenaba la fuga de datos).

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

  for (const [origen, raw] of [['body', req.body?.cliente_id], ['query', req.query?.cliente_id]]) {
    if (raw == null || raw === '') continue;
    if (parseId(raw) !== jwtClienteId) return violation(origen, raw);
  }

  req.clienteId = jwtClienteId;

  if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
    req.body.cliente_id = jwtClienteId;
  }

  next();
};

// router.param handler: valida el :cliente_id del path contra el JWT.
// Firma (req, res, next, value). Si no hay contexto de tenant (routers
// públicos como saas/tiers) no aplica: deja pasar.
const enforceParamTenant = (req, res, next, value) => {
  if (req.clienteId == null) return next(); // ruta pública, sin tenant
  const cid = parseId(value);
  if (cid === null) {
    return res.status(400).json({ error: 'Parámetro cliente_id inválido', code: 'INVALID_PARAM' });
  }
  if (cid !== req.clienteId) {
    console.warn(
      `[TENANT VIOLATION param] user=${req.user?.userId} jwt=${req.clienteId} ` +
      `declarado=${value} ip=${req.ip} ${req.method} ${req.originalUrl}`
    );
    return res.status(403).json({ error: 'Acceso denegado al recurso solicitado', code: 'TENANT_MISMATCH' });
  }
  next();
};

// router.param handler: valida que :id sea un entero positivo, antes de que
// llegue a la DB (evita fugas del tipo "invalid input syntax for type integer").
const validateIdParam = (req, res, next, value) => {
  if (parseId(value) === null) {
    return res.status(400).json({ error: 'Parámetro id inválido', code: 'INVALID_PARAM' });
  }
  next();
};

/**
 * Registra los guards de tenant/params en un router.
 * Llamar al tope de cada router de tenant, reemplazando el viejo
 * `router.use(enforceParamTenant)` (que no funcionaba).
 */
function registerTenantGuards(router) {
  router.param('cliente_id', enforceParamTenant);
  router.param('id', validateIdParam);
}

module.exports = { scopeTenant, enforceParamTenant, validateIdParam, registerTenantGuards, parseId };
