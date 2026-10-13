// middleware/cuentaGuards.js
//
// Dos guards globales para las rutas de tenant (se montan después de
// authenticateJWT + scopeTenant en node.js).
//
// 1) Contraseña temporal: una cuenta entregada por el admin (profesor, tutor,
//    alumno) entra con contraseña temporal. Hasta cambiarla sólo puede usar
//    /api/cuenta/*.
//
// 2) Usuarios externos: profesor, tutor y alumno NO son staff del tenant.
//    Deny-by-default: sólo acceden a lo que se habilita acá. Antes del rubro
//    educación todos los usuarios eran staff y muchos routers no chequean rol
//    (ej. POST /api/userrol), así que un alumno podría haberse asignado admin.
//
// Se decide por req.user.tipo (código de user_type, viaja en el JWT) y no por
// el nombre del rol, que el admin puede editar.

const TIPOS_EXTERNOS = new Set(['PROF', 'TUT', 'ALU']);

// Prefijos habilitados para externos. /api/edu llega con el módulo de alumnos.
const PREFIJOS_EXTERNOS = ['/api/cuenta/', '/api/edu/'];
// Lecturas puntuales que el front hace en todas las pantallas.
const LECTURAS_EXTERNOS = new Set(['/api/cliente-plan/mi-plan']);

const pathDe = (req) => (req.originalUrl || req.url || '').split('?')[0].replace(/\/+$/, '');

const esExterno = (user) => TIPOS_EXTERNOS.has(user?.tipo);

const requirePasswordDefinitiva = (req, res, next) => {
  if (!req.user?.debeCambiarPassword) return next();
  if (pathDe(req).startsWith('/api/cuenta/')) return next();
  return res.status(403).json({
    error: 'Tenés que cambiar tu contraseña temporal antes de continuar.',
    code: 'PASSWORD_TEMPORAL',
  });
};

const restringirExternos = (req, res, next) => {
  if (!esExterno(req.user)) return next();
  const path = pathDe(req);
  const permitido =
    PREFIJOS_EXTERNOS.some((p) => (path + '/').startsWith(p)) ||
    (req.method === 'GET' && LECTURAS_EXTERNOS.has(path));
  if (permitido) return next();
  console.warn(`[EXTERNO] user=${req.user?.userId} tipo=${req.user?.tipo} → ${req.method} ${path}`);
  return res.status(403).json({ error: 'Tu usuario no tiene acceso a esta sección.', code: 'ROL_SIN_ACCESO' });
};

/** Exige uno de los tipos de usuario indicados (ej. requireTipo('PROF')). */
const requireTipo = (...tipos) => (req, res, next) => {
  if (tipos.includes(req.user?.tipo)) return next();
  return res.status(403).json({ error: 'Tu usuario no tiene acceso a esta sección.', code: 'ROL_SIN_ACCESO' });
};

module.exports = { TIPOS_EXTERNOS, esExterno, requirePasswordDefinitiva, restringirExternos, requireTipo };
