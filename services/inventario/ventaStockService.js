// services/inventario/ventaStockService.js — Fase 2: el stock se mueve con las ventas.
//
// · Vender descuenta, por cada línea, (cantidad + 0,5·mitad) × receta.
// · Borrar un pedido devuelve exactamente lo neto que se le descontó
//   (venta + reversas anteriores): nunca se duplica ni se borra un movimiento.
// · NUNCA frena una venta: si algo del stock falla, la venta sigue y queda
//   el error en el log. Dentro de la transacción del request se usa un
//   SAVEPOINT, así un error del stock no aborta la transacción del pedido.
const pool = require('../../pool');
const { getStore } = require('../../tenantContext');
const db = require('../../model/inventario/db');
const planService = require('../cliente/planService');

const redondear = (n) => Math.round(n * 1000) / 1000;

/** Unidades vendidas de una línea de pedido: las mitades cuentan 0,5. */
const unidadesDeLinea = (linea) => {
  const enteras = Number(linea.cantidad) || 0;
  const mitades = Number(linea.cantidad_mitad) || 0;
  return enteras + mitades * 0.5;
};

/** Consumo por ítem de stock para un conjunto de líneas y sus recetas. */
const calcularConsumo = (lineas, recetas) => {
  const porProducto = new Map();
  for (const r of recetas) {
    const pid = Number(r.producto_id);
    if (!porProducto.has(pid)) porProducto.set(pid, []);
    porProducto.get(pid).push(r);
  }
  const consumo = new Map();
  for (const l of lineas) {
    const unidades = unidadesDeLinea(l);
    if (!(unidades > 0)) continue;
    for (const r of porProducto.get(Number(l.producto_id)) || []) {
      const id = Number(r.stock_item_id);
      const prev = consumo.get(id) || { stock_item_id: id, nombre: r.nombre, cantidad: 0 };
      prev.cantidad = redondear(prev.cantidad + unidades * Number(r.cantidad_por_unidad));
      consumo.set(id, prev);
    }
  }
  return [...consumo.values()].filter((c) => c.cantidad > 0);
};

/** Corre `fn` sin que un error suyo tumbe la operación de afuera. */
const sinFrenar = async (etiqueta, fn) => {
  const enTransaccion = !!getStore();
  try {
    if (enTransaccion) await pool.query('SAVEPOINT stock_venta');
    const r = await fn();
    if (enTransaccion) await pool.query('RELEASE SAVEPOINT stock_venta');
    return r;
  } catch (err) {
    if (enTransaccion) {
      try { await pool.query('ROLLBACK TO SAVEPOINT stock_venta'); } catch { /* la tx ya está rota: el pedido fallará igual */ }
    }
    console.error(`[stock] ${etiqueta}: ${err.message}`);
    return null;
  }
};

/** ¿Este comercio descuenta stock? Módulo inventario + plan con inventario. */
const descuentaStock = async (cliente_id) => {
  if (!(await db.tenantUsaInventario(cliente_id))) return false;
  const { features, isExpired } = await planService.getClienteTierAndFeatures(cliente_id);
  return !isExpired && features.canUseInventario === true;
};

/**
 * Descuenta el stock de un pedido recién creado. Devuelve los ítems que
 * cruzaron su mínimo con esta venta (para avisar), o [] / null.
 */
const descontarPorPedido = (cliente_id, { pedido_id, lineas, usuario_id, comanda_nro = null }) =>
  sinFrenar(`descontar pedido ${pedido_id}`, async () => {
    if (!Array.isArray(lineas) || !lineas.length || !usuario_id) return [];
    if (!(await descuentaStock(cliente_id))) return [];

    // Idempotente: un pedido que ya descontó no vuelve a descontar
    if ((await db.getNetoVentaPorPedido(cliente_id, pedido_id)).length) return [];

    const ids = [...new Set(lineas.map((l) => Number(l.producto_id)).filter(Number.isInteger))];
    if (!ids.length) return [];
    const recetas = await db.getRecetasPorProductos(cliente_id, ids);
    const consumo = calcularConsumo(lineas, recetas);
    if (!consumo.length) return [];

    const itemIds = consumo.map((c) => c.stock_item_id);
    const antes = await db.getStocks(cliente_id, itemIds);
    const nota = comanda_nro ? `Pedido #${comanda_nro}` : `Pedido ${pedido_id}`;
    for (const c of consumo) {
      await db.insertMovimiento(cliente_id, {
        stock_item_id: c.stock_item_id, tipo: 'venta', cantidad: -c.cantidad, pedido_id, usuario_id, nota,
      });
    }

    // Cruces del mínimo: estaba en o sobre el mínimo y quedó por debajo
    const minimos = new Map(recetas.map((r) => [Number(r.stock_item_id), r.stock_minimo == null ? null : Number(r.stock_minimo)]));
    return consumo
      .map((c) => {
        const minimo = minimos.get(c.stock_item_id);
        const previo = antes.get(c.stock_item_id) ?? 0;
        const actual = redondear(previo - c.cantidad);
        return { ...c, previo, actual, minimo };
      })
      .filter((c) => c.minimo != null && c.previo >= c.minimo && c.actual < c.minimo);
  });

/** Devuelve al stock lo descontado por un pedido que se va a borrar. */
const revertirPedido = (cliente_id, { pedido_id, usuario_id, comanda_nro = null }) =>
  sinFrenar(`revertir pedido ${pedido_id}`, async () => {
    if (!usuario_id) return 0;
    const netos = await db.getNetoVentaPorPedido(cliente_id, pedido_id);
    const nota = `${comanda_nro ? `Pedido #${comanda_nro}` : `Pedido ${pedido_id}`} borrado`;
    let n = 0;
    for (const { stock_item_id, neto } of netos) {
      const devolver = redondear(-neto);
      if (!(devolver > 0)) continue;
      await db.insertMovimiento(cliente_id, {
        stock_item_id, tipo: 'reversa_venta', cantidad: devolver, pedido_id, usuario_id, nota,
      });
      n += 1;
    }
    return n;
  });

module.exports = { descontarPorPedido, revertirPedido, _interno: { calcularConsumo, unidadesDeLinea } };
