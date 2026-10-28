// services/harness/core/contexto.js — quién pregunta y desde qué comercio.
//
// El turno de Telegram no trae JWT: módulos y permisos se cargan con
// buildSessionUser, la MISMA función que arma el JWT del login. Una sola
// fuente: si un rol pierde un permiso en Counter, lo pierde en el bot.
// Plan, rubro y zona horaria salen de planService (rubro_tier + cliente).

const planService = require('../../cliente/planService');
const userService = require('../../user/userService');
const { hoyEn, TZ_DEFAULT } = require('../../../utils/fechaTenant');

/**
 * @returns {{ clienteId, userId, rubroCodigo, tierCode, features, isExpired,
 *             timezone, hoy, modules, permissions, tipo }}
 */
const cargarContexto = async ({ clienteId, userId }) => {
  const cid = Number(clienteId);
  const uid = Number(userId);
  if (!Number.isInteger(cid) || cid <= 0) throw new Error('contexto: cliente_id inválido');
  if (!Number.isInteger(uid) || uid <= 0) throw new Error('contexto: user_id inválido');

  const [plan, sesion] = await Promise.all([
    planService.getClienteTierAndFeatures(cid),
    userService.buildSessionUser({ id: uid, cliente_id: cid }),
  ]);
  const timezone = plan.timezone || TZ_DEFAULT;

  return {
    clienteId: cid,
    userId: uid,
    rubroCodigo: plan.rubroCodigo,
    tierCode: plan.tierCode,
    features: plan.features || {},
    isExpired: plan.isExpired === true,
    timezone,
    hoy: hoyEn(timezone),
    modules: sesion.modules || [],
    permissions: sesion.permissions || {},
  };
};

module.exports = { cargarContexto };
