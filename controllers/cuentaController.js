// controllers/cuentaController.js
const cuentaService = require('../services/cuenta/cuentaService');
const userService = require('../services/user/userService');
const { issueToken, reissueToken, TTL } = require('../services/auth/tokenService');
const { motivoRechazo } = require('../services/verificacion/estados');

const responderError = (res, next, err) => {
  if (err instanceof cuentaService.CuentaError) {
    return res.status(err.status).json({ error: err.message, code: err.code, field: err.field });
  }
  return next(err);
};

const getTipos = async (req, res, next) => {
  try {
    res.json(await cuentaService.getTiposCredencialesService(req.clienteId));
  } catch (err) {
    next(err);
  }
};

const crearCredenciales = async (req, res, next) => {
  try {
    const r = await cuentaService.crearCredencialesService(req.clienteId, req.body);
    res.status(201).json(r);
  } catch (err) {
    responderError(res, next, err);
  }
};

const resetPassword = async (req, res, next) => {
  try {
    const r = await cuentaService.resetPasswordService(req.clienteId, req.params.userId, req.user?.userId);
    res.json(r);
  } catch (err) {
    responderError(res, next, err);
  }
};

/**
 * Cambio de la propia contraseña. Devuelve un token nuevo: el anterior trae
 * debeCambiarPassword = true y seguiría bloqueado hasta vencer.
 */
const cambiarPassword = async (req, res, next) => {
  try {
    const { actual, nueva } = req.body || {};
    await cuentaService.cambiarPasswordService(req.clienteId, req.user?.userId, actual, nueva);
    const sesion = await userService.buildSessionById(req.user.userId);
    res.json({ ok: true, token: issueToken(sesion), expiresIn: TTL });
  } catch (err) {
    responderError(res, next, err);
  }
};

/**
 * Token nuevo con los roles, módulos y permisos ACTUALES del usuario.
 *
 * Los permisos viajan en el JWT (8 h): si el dueño cambia un rol, el empleado
 * no lo veía hasta volver a loguearse ("le di permiso y no anda"). El front
 * lo pide al volver a la pestaña y cuando una acción da 403 por permiso.
 * Usuario dado de baja → 401 (el front cierra la sesión). Comercio
 * suspendido o sin verificar → el mismo 403 que el login.
 */
const refrescarSesion = async (req, res, next) => {
  try {
    const sesion = await userService.buildSessionById(req.user.userId);
    if (!sesion || Number(sesion.cliente_id) !== Number(req.clienteId)) {
      return res.status(401).json({ error: 'Sesión inválida', code: 'SESION_INVALIDA' });
    }
    const rechazo = motivoRechazo(sesion.cliente_estado);
    if (rechazo) return res.status(403).json(rechazo);
    // Mismo vencimiento que el token actual: refrescar no alarga la sesión.
    res.json({ token: reissueToken(sesion, req.user.exp) });
  } catch (err) {
    next(err);
  }
};

module.exports = { getTipos, crearCredenciales, resetPassword, cambiarPassword, refrescarSesion };
