// services/inventario/recetaService.js — Fase 2: recetas por producto.
//
// Plan: con canUseRecetas (PREMIUM/CUSTOM) una receta lleva cualquier insumo.
// Sin él (BASIC) sólo se permite el vínculo 1:1 de un producto que se vende
// tal cual (gaseosa → 1 u del ítem "Gaseosa", de tipo producto).
const db = require('../../model/inventario/db');
const { _interno: { aUnidadDelItem } } = require('./inventarioService');

const MAX_LINEAS = 30;

const error = (status, message, code) => Object.assign(new Error(message), { status, code });
const bad = (message, code = 'VALIDACION') => error(400, message, code);

const aNumeros = (r) => ({
  ...r,
  cantidad_por_unidad: Number(r.cantidad_por_unidad),
});

const listarProductos = async (cliente_id) => {
  const rows = await db.listProductosConReceta(cliente_id);
  return rows.map((p) => ({ ...p, receta: (p.receta || []).map(aNumeros) }));
};

const productoDelTenant = async (cliente_id, producto_id) => {
  const p = await db.getProducto(cliente_id, producto_id);
  if (!p) throw error(404, 'Producto no encontrado', 'NO_ENCONTRADO');
  return p;
};

const obtener = async (cliente_id, producto_id) => {
  const producto = await productoDelTenant(cliente_id, producto_id);
  return { producto, receta: (await db.getReceta(cliente_id, producto_id)).map(aNumeros) };
};

/** El vínculo 1:1 que se permite sin canUseRecetas. */
const esVinculoDirecto = (lineas, itemPorId) => {
  if (lineas.length !== 1) return false;
  const item = itemPorId.get(lineas[0].stock_item_id);
  return item.tipo === 'producto' && item.unidad === 'u' && lineas[0].cantidad_por_unidad === 1;
};

const guardar = async (cliente_id, producto_id, body = {}, features = {}) => {
  await productoDelTenant(cliente_id, producto_id);
  const entrada = Array.isArray(body.lineas) ? body.lineas : null;
  if (!entrada) throw bad('Mandá las líneas de la receta (lista vacía para quitarla)');
  if (entrada.length > MAX_LINEAS) throw bad(`Una receta no puede tener más de ${MAX_LINEAS} ingredientes`);

  const ids = entrada.map((l) => Number(l?.stock_item_id));
  if (!ids.every((id) => Number.isInteger(id) && id > 0)) throw bad('stock_item_id inválido');
  if (new Set(ids).size !== ids.length) throw bad('Un ingrediente está repetido');

  const items = ids.length ? await db.getItemsPorIds(cliente_id, ids) : [];
  const itemPorId = new Map(items.map((i) => [Number(i.id), i]));
  if (items.length !== ids.length) throw error(404, 'Algún ingrediente no existe', 'NO_ENCONTRADO');
  const inactivo = items.find((i) => !i.activo);
  if (inactivo) throw error(409, `"${inactivo.nombre}" está dado de baja`, 'ITEM_INACTIVO');

  const lineas = entrada.map((l, idx) => {
    const item = itemPorId.get(ids[idx]);
    const n = typeof l.cantidad === 'string' ? Number(l.cantidad.replace(',', '.')) : l.cantidad;
    if (typeof n !== 'number' || !Number.isFinite(n) || !(n > 0)) throw bad(`Cantidad inválida para "${item.nombre}"`);
    const cantidad_por_unidad = Math.round(aUnidadDelItem(n, l.unidad ?? null, item) * 10000) / 10000;
    if (!(cantidad_por_unidad > 0)) throw bad(`La cantidad de "${item.nombre}" es demasiado chica`);
    return { stock_item_id: ids[idx], cantidad_por_unidad };
  });

  if (features.canUseRecetas !== true && lineas.length && !esVinculoDirecto(lineas, itemPorId)) {
    throw error(
      403,
      'Tu plan permite vincular un producto con su stock (1 a 1). Las recetas con insumos están en el plan Premium.',
      'RECETAS_PLAN'
    );
  }

  await db.replaceReceta(cliente_id, producto_id, lineas);
  return obtener(cliente_id, producto_id);
};

module.exports = { listarProductos, obtener, guardar };
