// services/harness/core/seguimiento.js — "¿y ayer?", "¿y los gastos?", "¿y de pizza?".
//
// Un mensaje corto que no es una consulta completa se resuelve contra la consulta
// anterior del MISMO chat (vigente unos minutos). Determinista, cero tokens.
//
//   · sólo una ventana ("y ayer", "y el mes pasado")  → mismo intent, ventana nueva
//   · otro tema sin ventana ("y los gastos?")         → intent nuevo, ventana anterior
//   · otro producto ("y de pizza?")                   → ventas_producto, mismo período
//
// Lo que se resuelve pasa por la MISMA autorización que una consulta nueva: un
// seguimiento no es un atajo para saltear permisos.

const { normalizar } = require('./normalizar');
const { parsearVentana } = require('./ventana');
const { router } = require('./router');

const TTL_SEGUNDOS = 600;
// Intents que aceptan seguimiento (los demás no tienen ventana o no se repiten con otra).
const RECORDABLES = new Set(['ventas_periodo', 'ventas_producto', 'gastos_periodo', 'gastos_sueldos', 'clientes_nuevos']);
const CON_VENTANA = new Set(['ventas_periodo', 'ventas_producto', 'gastos_periodo', 'gastos_sueldos', 'clientes_nuevos']);
const RELLENO = new Set(['y', 'e', 'en', 'de', 'del', 'para', 'durante', 'que', 'tal', 'cuanto', 'cuantos', 'cuantas', 'como', 'fue', 'fueron', 'el', 'la', 'los', 'las', 'un', 'una']);
const MAX_PALABRAS = 7;

const sinRelleno = (t) => t.split(' ').filter((w) => w && !RELLENO.has(w)).join(' ');

/** Lo que hay que recordar de un turno resuelto (o null si no admite seguimiento). */
const aEstado = (turno) => {
  if (!turno || !RECORDABLES.has(turno.intent)) return null;
  return { intent: turno.intent, params: { texto: turno.texto, producto: turno.producto ?? null } };
};

/**
 * @param {string} texto  mensaje actual
 * @param {{ intent, params }|null} previo  estado vigente del chat
 * @param {{ hoy, tz }} opt
 * @returns turno `{ intent, texto, producto?, seguimiento: true }` o null si no es un seguimiento
 */
const resolverSeguimiento = (texto, previo, opt) => {
  if (!previo || !CON_VENTANA.has(previo.intent)) return null;
  const t = normalizar(texto);
  if (!t || t.split(' ').length > MAX_PALABRAS) return null;

  const ventana = parsearVentana(t, opt);
  const resto = sinRelleno(ventana?.texto ? t.replace(ventana.texto, ' ') : t);
  const empieza = /^(y|e)\b/.test(t);

  // 1) sólo una ventana → misma consulta, otro período
  if (ventana && !resto) {
    return { intent: previo.intent, texto: t, producto: previo.params?.producto ?? null, seguimiento: true };
  }

  // 2) otro tema sin ventana propia → hereda la ventana anterior ("y los gastos?")
  if (!ventana && empieza) {
    const otro = router(t.replace(/^(y|e)\s+/, ''));
    if (otro && otro.intent !== 'ayuda' && otro.intent !== 'ventas_comparar' && CON_VENTANA.has(otro.intent)) {
      return { ...otro, texto: previo.params?.texto || t, seguimiento: true };
    }
    // 3) otro producto ("y de pizza?")
    if (previo.intent === 'ventas_producto' && resto && resto.split(' ').length <= 3) {
      return { intent: 'ventas_producto', texto: previo.params?.texto || t, producto: resto, seguimiento: true };
    }
  }
  // ventana + producto nuevo ("y de pizza ayer") lo cubre la consulta normal si el router la entiende
  return null;
};

module.exports = { resolverSeguimiento, aEstado, TTL_SEGUNDOS, RECORDABLES };
