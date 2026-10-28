// services/harness/core/router.js — etapa 1: patrones deterministas (cero tokens).
//
// texto → { intent, params } | null. Se normaliza UNA vez (core/normalizar) y los
// patrones se escriben sobre ese texto: sin tildes, minúsculas, sin signos.
// El orden importa: lo más específico primero. Los patrones salen de preguntas
// reales de turn_log; lo que no matchea cae al fallback (no se inventa respuesta).

const { normalizar } = require('./normalizar');

const SALUDO = /^(hola+|holis|buenas|buen dia|buenos dias|buenas tardes|buenas noches|hey|ayuda|help|menu|que (podes|sabes|haces)( hacer)?|como funcionas?)( bot| counter)?$/;
const VERBO_VENTA = '(?:vendi|vendimos|vendio|vendieron|factur\\w*|ingres\\w*|entr(?:o|aron|adas?)|recaud\\w*|ventas?|vendido)';

const router = (texto) => {
  const t = normalizar(texto);
  if (!t) return null;
  if (SALUDO.test(t)) return { intent: 'ayuda', texto: t };

  if (/\bcompar\w*|\bvs\b|\bversus\b/.test(t) && new RegExp(VERBO_VENTA).test(t)) {
    return { intent: 'ventas_comparar', texto: t };
  }
  if (/\bclientes? nuev\w*|\bnuevos clientes\b|\baltas? de clientes\b/.test(t)) {
    return { intent: 'clientes_nuevos', texto: t };
  }
  if (/\b(sueldos?|salarios?|jornales?)\b/.test(t)) return { intent: 'gastos_sueldos', texto: t };
  if (/\b(gaste|gastamos|gastos?|egresos?|salidas? de caja|pague|pagamos)\b/.test(t)) {
    return { intent: 'gastos_periodo', texto: t };
  }

  // Unidades: "cuántas hamburguesas vendí", "cuántos cafés vendimos"
  let m = t.match(new RegExp(`\\bcuant(?:os|as)\\s+(.+?)\\s+${VERBO_VENTA}\\b`));
  if (m) return { intent: 'ventas_producto', producto: m[1], texto: t };
  // "cuánto vendí de pizza", "ventas de empanadas"
  m = t.match(new RegExp(`\\b${VERBO_VENTA}\\s+(?:de|en)\\s+(?!hoy\\b|ayer\\b|este\\b|esta\\b|el\\b|la\\b|los\\b|las\\b)(.+)$`));
  if (m) return { intent: 'ventas_producto', producto: m[1], texto: t };

  if (new RegExp(`\\b(cuanto|cuanta plata|total|ventas?|resumen)\\b.*${VERBO_VENTA}|\\b(ventas?|facturacion|recaudacion)\\b`).test(t)) {
    return { intent: 'ventas_periodo', texto: t };
  }
  return null;
};

module.exports = { router };
