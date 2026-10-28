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
const gastronomia = require('../gastronomia/catalogo');

const CATALOGOS = { gastronomia: gastronomia.CATALOGO };
const AYUDAS = { gastronomia: gastronomia.AYUDA };

const NO_ENTENDI = (ayuda) => `No entendí esa consulta todavía.\n\n${ayuda}`;

/**
 * @param {{ clienteId, userId, texto }} entrada
 * @param {{ cargarContexto?: Function }} deps  (tests)
 * @returns {{ intent, texto, stage, ok }}
 */
const manejarTurno = async ({ clienteId, userId, texto }, deps = {}) => {
  const ctx = await (deps.cargarContexto || cargarContexto)({ clienteId, userId });
  const catalogo = CATALOGOS[ctx.rubroCodigo];
  if (!catalogo) {
    return { intent: 'sin_catalogo', stage: 'router', ok: true, texto: 'Las consultas por chat todavía no están disponibles para tu tipo de comercio.' };
  }
  const turno = router(texto);
  if (!turno) return { intent: 'no_entendido', stage: 'router', ok: true, texto: NO_ENTENDI(AYUDAS[ctx.rubroCodigo]) };

  const intent = catalogo.find((i) => i.name === turno.intent);
  if (!intent) return { intent: 'no_entendido', stage: 'router', ok: true, texto: NO_ENTENDI(AYUDAS[ctx.rubroCodigo]) };

  const permiso = autorizar(intent, ctx);
  if (!permiso.ok) return { intent: intent.name, stage: `negado_${permiso.eje}`, ok: true, texto: permiso.mensaje };

  const { texto: respuesta } = await intent.ejecutar(turno, ctx);
  return { intent: intent.name, stage: 'ejecutor', ok: true, texto: respuesta };
};

module.exports = { manejarTurno };
