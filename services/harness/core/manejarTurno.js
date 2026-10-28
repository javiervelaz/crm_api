// services/harness/core/manejarTurno.js — un turno del harness interno.
//
//   texto → router (etapa 1) → autorizar (rubro/plan/usuario) → ejecutor → respuesta
//
// Fail-closed: cualquier cosa que no se pueda resolver o autorizar termina en un
// texto fijo, nunca en un dato. La negativa de autorización no filtra datos.
// Lo que sale de acá lo registra canalesService en turn_log (intent/stage/ok).

const { router } = require('./router');
const { autorizar } = require('./autorizacion');
const { cargarContexto } = require('./contexto');
const { resolverSeguimiento, aEstado, TTL_SEGUNDOS } = require('./seguimiento');
const estadoDb = require('../../../model/harness/estado');
const gastronomia = require('../gastronomia/catalogo');

const CATALOGOS = { gastronomia: gastronomia.CATALOGO };
const AYUDAS = { gastronomia: gastronomia.AYUDA };

const NO_ENTENDI = (ayuda) => `No entendí esa consulta todavía.\n\n${ayuda}`;

/**
 * @param {{ clienteId, userId, texto, chat? }} entrada  chat = { canalCuentaId, chatId } habilita el seguimiento
 * @param {{ cargarContexto?: Function, estado?: { cargar, guardar } }} deps  (tests)
 * @returns {{ intent, texto, stage, ok }}
 */
/** El estado de conversación es una comodidad: si falla, el turno sigue como una consulta nueva. */
const estadoSeguro = (estado) => ({
  cargar: async (...a) => { try { return await estado.cargar(...a); } catch (e) { console.error('[harness] estado.cargar:', e.message); return null; } },
  guardar: async (...a) => { try { await estado.guardar(...a); } catch (e) { console.error('[harness] estado.guardar:', e.message); } },
});

const manejarTurno = async ({ clienteId, userId, texto, chat }, deps = {}) => {
  const ctx = await (deps.cargarContexto || cargarContexto)({ clienteId, userId });
  const catalogo = CATALOGOS[ctx.rubroCodigo];
  if (!catalogo) {
    return { intent: 'sin_catalogo', stage: 'router', ok: true, texto: 'Las consultas por chat todavía no están disponibles para tu tipo de comercio.' };
  }
  const estado = chat ? estadoSeguro(deps.estado || estadoDb) : null;
  const previo = estado ? await estado.cargar(ctx.clienteId, chat.canalCuentaId, chat.chatId) : null;
  const seguimiento = previo ? resolverSeguimiento(texto, previo, { hoy: ctx.hoy, tz: ctx.timezone }) : null;
  const turno = seguimiento || router(texto);
  if (!turno) return { intent: 'no_entendido', stage: 'router', ok: true, texto: NO_ENTENDI(AYUDAS[ctx.rubroCodigo]) };

  const intent = catalogo.find((i) => i.name === turno.intent);
  if (!intent) return { intent: 'no_entendido', stage: 'router', ok: true, texto: NO_ENTENDI(AYUDAS[ctx.rubroCodigo]) };

  const permiso = autorizar(intent, ctx);
  if (!permiso.ok) return { intent: intent.name, stage: `negado_${permiso.eje}`, ok: true, texto: permiso.mensaje };

  const { texto: respuesta } = await intent.ejecutar(turno, ctx);
  // Se recuerda sólo lo que se resolvió y respondió: una negativa o un "no entendí" no pisan el contexto.
  const recuerdo = estado && aEstado(turno);
  if (recuerdo) await estado.guardar(ctx.clienteId, chat.canalCuentaId, chat.chatId, { userId: ctx.userId, ...recuerdo, ttlSegundos: TTL_SEGUNDOS });
  return { intent: intent.name, stage: turno.seguimiento ? 'seguimiento' : 'ejecutor', ok: true, texto: respuesta };
};

module.exports = { manejarTurno };
