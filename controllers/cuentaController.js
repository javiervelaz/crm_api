// controllers/cuentaController.js
const cuentaService = require('../services/cuenta/cuentaService');
const userService = require('../services/user/userService');
const { issueToken, TTL } = require('../services/auth/tokenService');

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

module.exports = { getTipos, crearCredenciales, resetPassword, cambiarPassword };
