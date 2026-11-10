// services/cliente/avisoLimiteService.js — mail al contacto del comercio cuando
// se acerca (80 %) o llega (100 %) a un límite numérico de su plan.
//
// Dedupe: la idempotencyKey del outbox (índice único). Un aviso por comercio,
// límite, nivel y período: los pedidos mensuales se avisan una vez por mes
// calendario del comercio; los topes de stock (productos, ítems) una sola vez.
// No hace falta tabla propia: las filas del outbox no se purgan salvo que se
// borre el comercio.
//
// Nunca lanza: un aviso que falla no puede cambiar la respuesta del request
// que lo disparó (el 403 del límite o el pedido que sí entró).
const pool = require('../../pool');
const mailer = require('../email');
const { TZ_DEFAULT, hoyEn } = require('../../utils/fechaTenant');
const { LIMITES, nivelPara } = require('./usoPlanService');

// Atajo por proceso: una vez avisado, los requests siguientes ni consultan la
// base. La garantía real es la idempotencyKey; esto sólo ahorra viajes.
const avisados = new Set();
const MAX_MEMO = 5000;

const periodoDe = (limitKey, timezone, ahora = new Date()) =>
  (LIMITES[limitKey]?.mensual ? hoyEn(timezone || TZ_DEFAULT, ahora).slice(0, 7) : 'unico');

const baseUrl = () => String(process.env.PLATFORM_BASE_URL || '').replace(/\/$/, '');

/**
 * @param {object}  p
 * @param {number}  p.clienteId
 * @param {string}  p.limitKey   maxPedidosMensuales | maxProductos | maxStockItems
 * @param {number}  p.usado      lo que el comercio YA tiene (no el +1 del request)
 * @param {number}  p.limite
 * @param {string} [p.tierCode]
 * @param {string} [p.tierNombre]
 * @param {string} [p.timezone]
 * @returns {Promise<{enviado: boolean, nivel: (80|100|null), motivo?: string}>}
 */
const evaluar = async ({ clienteId, limitKey, usado, limite, tierCode, tierNombre, timezone } = {}) => {
  try {
    const def = LIMITES[limitKey];
    const nivel = nivelPara(usado, limite);
    if (!def || !nivel || !Number.isInteger(Number(clienteId))) return { enviado: false, nivel: nivel ?? null, motivo: 'sin_aviso' };

    const clave = `limite-plan:${clienteId}:${limitKey}:${nivel}:${periodoDe(limitKey, timezone)}`;
    if (avisados.has(clave)) return { enviado: false, nivel, motivo: 'ya_avisado' };

    // Lectura directa: no depende de la transacción del request (que en un 403 puede revertirse).
    const { rows } = await pool.queryDirecta(
      'SELECT nombre, contacto_nombre, contacto_email FROM cliente WHERE id = $1',
      [Number(clienteId)]
    );
    const c = rows[0];
    if (!c?.contacto_email) return { enviado: false, nivel, motivo: 'sin_email' };

    const r = await mailer.enqueue({
      template: 'limite-plan',
      to: c.contacto_email,
      toName: c.contacto_nombre || undefined,
      clienteId: Number(clienteId),
      idempotencyKey: clave,
      data: {
        nombreContacto: c.contacto_nombre || '',
        nombreComercio: c.nombre,
        tierNombre: tierNombre || tierCode || 'actual',
        recurso: def.recurso,
        usado: Number(usado),
        limite: Number(limite),
        alcanzado: nivel === 100,
        mensual: def.mensual,
        linkAfectado: def.afectaLinkPublico,
        urlPlan: `${baseUrl()}/dashboard/plan`,
      },
    }, { query: (...args) => pool.queryDirecta(...args) }); // fuera de la transacción del request

    if (avisados.size >= MAX_MEMO) avisados.clear();
    avisados.add(clave);
    return { enviado: !r.duplicado, nivel, motivo: r.duplicado ? 'ya_avisado' : undefined };
  } catch (err) {
    console.error('[avisoLimite]', err.message);
    return { enviado: false, nivel: null, motivo: 'error' };
  }
};

/** Sólo para tests: olvida los avisos ya hechos en este proceso. */
const _reset = () => avisados.clear();

module.exports = { evaluar, periodoDe, _reset };
