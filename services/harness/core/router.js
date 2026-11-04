// services/harness/core/router.js — etapa 1: patrones deterministas (cero tokens).
//
// texto → { intent, params } | null. Se normaliza UNA vez (core/normalizar) y los
// patrones se escriben sobre ese texto: sin tildes, minúsculas, sin signos.
// El orden importa: lo más específico primero. Los patrones salen de preguntas
// reales de turn_log; lo que no matchea cae al fallback (no se inventa respuesta).

const { normalizar } = require('./normalizar');

const SALUDO = /^(hola+|holis|buenas|buen dia|buenos dias|buenas tardes|buenas noches|hey|ayuda|help|menu|que (podes|sabes|haces)( hacer)?|como funcionas?)( bot| counter)?$/;
const VERBO_VENTA = '(?:vendi|vendimos|vendio|vendieron|factur\\w*|ingres\\w*|entr(?:o|aron|adas?)|recaud\\w*|ventas?|vendido)';

// Stock (inventario). Lo que no es un ítem de stock aunque la frase lo parezca
// ("cuántos pedidos hay", "cuánta plata me queda") sigue de largo.
const NO_ES_STOCK = /^(pedidos?|ventas?|clientes?|plata|dinero|caja|efectivo|gastos?|mesas?|turnos?|empleados?|deudas?)\b/;
const UNIDADES_STOCK = /\b(kilos?|kg|gramos?|grs?|litros?|lts?|unidades?|paquetes?|cajas?|bolsas?|horm\w*)\s+(de\s+)?/g;
const STOCK_BAJO = /\b(que|cuales?) (tengo|hay|tenemos|necesito|me toca) que (comprar|reponer|pedir)\b|\bque (compro|repongo|me falta|nos falta|falta)\b(?! (pagar|cobrar))|\bfaltantes?\b|\b(stock|inventario) bajo\b|\blista de (compras?|reposicion)\b|\bque se (esta |estan )?(acabando|terminando)\b/;
// Compras de stock ya hechas ("qué compré hoy"). El presente "qué compro" es
// lo que falta (STOCK_BAJO), por eso acá sólo pasado y el sustantivo.
const COMPRAS = /\b(compre|compramos|compraron|comprado|comprados|comprada|compradas)\b|\b(las|mis|nuestras) compras\b|^compras?\b/;
const STOCK_RESUMEN = /^(el |mi )?(stock|inventario)$|^como (esta|anda|va) (el |mi )?(stock|inventario)$|^que (tengo|hay) en (el )?(stock|inventario)$/;

const itemDeStock = (t) => {
  const pats = [
    /\bcuant[oa]s? (?:me |nos )?(?:queda\w*|hay|tengo|tenemos) de (.+)$/,
    /\b(?:stock|inventario) de (.+)$/,
    /\bcuant[oa]s? (.+?) (?:me |nos |te )?(?:queda\w*|hay|tengo|tenemos)\b/,
    /^(?:me |nos )?(?:queda|quedan|hay) (?:algo de |todavia |aun )?(.+)$/,
  ];
  for (const re of pats) {
    const m = t.match(re);
    if (!m) continue;
    const term = m[1].replace(UNIDADES_STOCK, '').trim();
    if (term && !NO_ES_STOCK.test(term)) return term;
  }
  return null;
};

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
  if (/\b(ultimo cierre|cierre de (la )?caja|cierre de ayer|con cuanto (cerre|cerramos|quedo)|cuanto (cerre|cerramos|quedo la caja))\b/.test(t)) {
    return { intent: 'ultimo_cierre', texto: t };
  }
  if (/\b(caja (abierta|cerrada)|esta (abierta|cerrada) la caja|estado de (la )?caja|como (esta|anda|va) la caja|abri la caja|la caja)\b/.test(t)) {
    return { intent: 'estado_caja', texto: t };
  }
  if (/\b(sueldos?|salarios?|jornales?)\b/.test(t)) return { intent: 'gastos_sueldos', texto: t };
  if (/\b(gaste|gastamos|gastos?|egresos?|salidas? de caja|pague|pagamos)\b/.test(t)) {
    return { intent: 'gastos_periodo', texto: t };
  }

  if (STOCK_BAJO.test(t)) return { intent: 'stock_bajo', texto: t };
  if (COMPRAS.test(t)) return { intent: 'compras_periodo', texto: t };
  if (STOCK_RESUMEN.test(t)) return { intent: 'stock_item', item: null, texto: t };

  // Unidades: "cuántas hamburguesas vendí", "cuántos cafés vendimos"
  let m = t.match(new RegExp(`\\bcuant(?:os|as)\\s+(.+?)\\s+${VERBO_VENTA}\\b`));
  if (m) return { intent: 'ventas_producto', producto: m[1], texto: t };
  // "cuánto vendí de pizza", "ventas de empanadas"
  m = t.match(new RegExp(`\\b${VERBO_VENTA}\\s+(?:de|en)\\s+(?!hoy\\b|ayer\\b|este\\b|esta\\b|el\\b|la\\b|los\\b|las\\b)(.+)$`));
  if (m) return { intent: 'ventas_producto', producto: m[1], texto: t };

  // "vendí algo hoy?", "se vendió algo?", "hubo ventas?" (de turn_log, curador 04/11)
  m = t.match(/\b(?:vendi|vendimos|vendio|vendieron) algo (?:de|en) (?!hoy\b|ayer\b|este\b|esta\b|el\b|la\b|los\b|las\b)(.+)$/);
  if (m) return { intent: 'ventas_producto', producto: m[1], texto: t };
  if (/\b(vendi|vendimos|vendio|vendieron) algo\b|\bhubo ventas?\b/.test(t)) return { intent: 'ventas_periodo', texto: t };
  if (new RegExp(`\\b(cuanto|cuanta plata|total|ventas?|resumen)\\b.*${VERBO_VENTA}|\\b(ventas?|facturacion|recaudacion)\\b`).test(t)) {
    return { intent: 'ventas_periodo', texto: t };
  }
  // Stock de un ítem: después de ventas, así "cuántas pizzas vendí" no cae acá
  const item = itemDeStock(t);
  if (item) return { intent: 'stock_item', item, texto: t };
  return null;
};

module.exports = { router };
