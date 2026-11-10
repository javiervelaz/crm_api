// model/cliente/uso.js — cuánto usa un comercio de cada límite numérico de su plan.
//
// Única fuente de estos conteos: los usan requireLimit (para bloquear), el
// endpoint /cliente-plan/uso (para mostrar la barra) y el aviso por mail. Si
// cada uno tuviera su SQL, la barra podría decir 49/50 mientras el middleware
// ya bloquea.
const pool = require('../../pool');
const { inicioMesUtcSql } = require('../../utils/fechaTenant');

const CONTADORES = {
  // Pedidos del mes calendario en la zona del comercio. Cuenta todos, anulados incluidos.
  maxPedidosMensuales: (clienteId) => pool.query(
    `SELECT COUNT(*) FROM pedido
            WHERE cliente_id = $1
              AND created_at >= ${inicioMesUtcSql('$1')}`,
    [clienteId]
  ),
  // Todas las filas de producto del comercio (no hay baja lógica que filtrar).
  maxProductos: (clienteId) => pool.query(
    'SELECT COUNT(*) FROM producto WHERE cliente_id = $1',
    [clienteId]
  ),
  maxStockItems: (clienteId) => pool.query(
    'SELECT COUNT(*) FROM stock_item WHERE cliente_id = $1 AND activo = true',
    [clienteId]
  ),
};

/** ¿Hay contador para este límite? */
const soporta = (limitKey) => Object.prototype.hasOwnProperty.call(CONTADORES, limitKey);

/** Cantidad usada del límite, o null si la clave no es un límite conocido. */
const contar = async (limitKey, clienteId) => {
  if (!soporta(limitKey)) return null;
  const res = await CONTADORES[limitKey](clienteId);
  return Number(res.rows[0].count);
};

module.exports = { contar, soporta };
