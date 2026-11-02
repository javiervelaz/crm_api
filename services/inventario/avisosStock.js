// services/inventario/avisosStock.js — Fase 3: aviso por Telegram cuando un
// ítem cruza su mínimo.
//
// · Sólo en el CRUCE (estaba en o sobre el mínimo y quedó por debajo): un aviso
//   por cada venta mientras sigue bajo spamearía al dueño.
// · Lo reciben quienes tienen avisos prendidos en su Telegram y acceso al
//   módulo inventario (no basta con tener Pedidos).
// · Se prepara dentro de la transacción (lee destinatarios) y se manda
//   después del COMMIT: si el pedido o el movimiento se deshace, no hay aviso.
const canalesService = require('../canales/canalesService');
const { despuesDelCommit } = require('../../middleware/tenantConnection');
const { cantidad } = require('../harness/core/formato');

const MAX_LISTA = 10;

/** cruces: [{ nombre, unidad, actual, minimo }] */
const textoCruces = (cruces) => {
  const lineas = cruces.slice(0, MAX_LISTA).map((c) => {
    const estado = c.actual <= 0 ? 'sin stock' : `quedan ${cantidad(c.actual, c.unidad)}`;
    return `• ${c.nombre}: ${estado} (mínimo ${cantidad(c.minimo, c.unidad)})`;
  });
  if (cruces.length > MAX_LISTA) lineas.push(`… y ${cruces.length - MAX_LISTA} más`);
  return [
    cruces.length === 1 ? '📦 Se está acabando un insumo' : `📦 Se están acabando ${cruces.length} insumos`,
    '',
    ...lineas,
    '',
    'Preguntame "¿qué tengo que comprar?" para ver la lista completa.',
  ].join('\n');
};

/** Prepara y encola el aviso. Nunca lanza: un aviso no puede romper una venta. */
const avisarCruces = async (cliente_id, cruces) => {
  if (!Array.isArray(cruces) || !cruces.length) return false;
  try {
    const enviar = await canalesService.prepararEnvioAvisos(cliente_id, textoCruces(cruces), {
      modulo: 'inventario',
      etiqueta: 'aviso de stock',
    });
    despuesDelCommit(enviar);
    return true;
  } catch (err) {
    console.warn(`[stock] aviso de mínimo (cliente ${cliente_id}): ${err.message}`);
    return false;
  }
};

module.exports = { avisarCruces, textoCruces };
