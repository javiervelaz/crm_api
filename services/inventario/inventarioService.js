// services/inventario/inventarioService.js — Fase 1a (PLAN_INVENTARIO_v2).
//
// · El stock es SUM del ledger: no hay cache que mantener.
// · Unidades canónicas u/kg/l. Los movimientos aceptan g y ml y se convierten.
// · Compra con registrar_gasto=true crea el gasto en caja en la misma
//   transacción del request (pool proxy): o quedan los dos o ninguno.
// · Nunca se bloquea por stock negativo.
const db = require('../../model/inventario/db');
const salidaCajaDb = require('../../model/salida_caja/db');
const planService = require('../cliente/planService');
const avisosStock = require('./avisosStock');
const { cruzaMinimo } = require('./ventaStockService');

const TIPOS_ITEM = ['insumo', 'producto'];
const UNIDADES = ['u', 'kg', 'l'];
// Unidad de ingreso → [unidad canónica, factor]
const CONVERSION = { u: ['u', 1], kg: ['kg', 1], g: ['kg', 0.001], l: ['l', 1], ml: ['l', 0.001] };
const NOMBRE_MAX = 120;
const NOTA_MAX = 200;

const error = (status, message, code) => Object.assign(new Error(message), { status, code });
const bad = (message, code = 'VALIDACION') => error(400, message, code);

const numero = (v, campo, { positivo = false, min = null } = {}) => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) throw bad(`${campo} debe ser un número`);
  if (positivo && !(n > 0)) throw bad(`${campo} debe ser mayor a cero`);
  if (min !== null && n < min) throw bad(`${campo} no puede ser menor a ${min}`);
  return n;
};

const redondear = (n, dec = 3) => Math.round(n * 10 ** dec) / 10 ** dec;

const nombreValido = (nombre) => {
  if (typeof nombre !== 'string' || !nombre.trim()) throw bad('El nombre es obligatorio');
  const limpio = nombre.trim().replace(/\s+/g, ' ');
  if (limpio.length > NOMBRE_MAX) throw bad(`El nombre no puede superar ${NOMBRE_MAX} caracteres`);
  if (/[<>]/.test(limpio)) throw bad('El nombre tiene caracteres no permitidos');
  return limpio;
};

const notaValida = (nota) => {
  if (nota == null || nota === '') return null;
  if (typeof nota !== 'string') throw bad('La nota debe ser texto');
  const limpia = nota.trim();
  if (limpia.length > NOTA_MAX) throw bad(`La nota no puede superar ${NOTA_MAX} caracteres`);
  return limpia || null;
};

/** Cantidad en la unidad del ítem. `unidad` es la de ingreso (opcional). */
const aUnidadDelItem = (cantidad, unidad, item) => {
  if (unidad == null) return cantidad;
  const conv = CONVERSION[unidad];
  if (!conv) throw bad(`Unidad inválida: ${unidad}`);
  if (conv[0] !== item.unidad) throw bad(`El ítem "${item.nombre}" se mide en ${item.unidad}, no en ${unidad}`);
  return redondear(cantidad * conv[1]);
};

const conflictoNombre = (e) => {
  if (e && e.code === '23505') throw error(409, 'Ya existe un ítem con ese nombre', 'NOMBRE_DUPLICADO');
  throw e;
};

const conEstado = (item) => {
  if (!item) return item;
  const stock = Number(item.stock);
  const minimo = item.stock_minimo == null ? null : Number(item.stock_minimo);
  let estado = 'ok';
  if (stock < 0) estado = 'negativo';
  else if (stock === 0) estado = 'sin_stock';
  else if (minimo !== null && stock < minimo) estado = 'bajo';
  return { ...item, stock, stock_minimo: minimo, costo_unitario: item.costo_unitario == null ? null : Number(item.costo_unitario), estado };
};

// ─── Ítems ────────────────────────────────────────────────────────────────

const listarItems = async (cliente_id, query = {}) => {
  const tipo = query.tipo ?? null;
  if (tipo !== null && !TIPOS_ITEM.includes(tipo)) throw bad('tipo inválido');
  const q = typeof query.q === 'string' && query.q.trim() ? query.q.trim().slice(0, NOMBRE_MAX) : null;
  const rows = await db.listItems(cliente_id, {
    tipo,
    bajoMinimo: query.bajo_minimo === 'true' || query.bajo_minimo === true,
    incluirInactivos: query.incluir_inactivos === 'true' || query.incluir_inactivos === true,
    q,
  });
  return rows.map(conEstado);
};

const obtenerItem = async (cliente_id, id) => {
  const item = await db.getItem(cliente_id, id);
  if (!item) throw error(404, 'Ítem no encontrado', 'NO_ENCONTRADO');
  return conEstado(item);
};

const crearItem = async (cliente_id, body = {}) => {
  const nombre = nombreValido(body.nombre);
  const tipo = body.tipo ?? 'insumo';
  if (!TIPOS_ITEM.includes(tipo)) throw bad('tipo debe ser insumo o producto');
  if (!UNIDADES.includes(body.unidad)) throw bad('unidad debe ser u, kg o l');
  const stock_minimo = body.stock_minimo == null || body.stock_minimo === ''
    ? null : numero(body.stock_minimo, 'stock_minimo', { min: 0 });
  const id = await db.createItem(cliente_id, { nombre, tipo, unidad: body.unidad, stock_minimo }).catch(conflictoNombre);
  return obtenerItem(cliente_id, id);
};

/** Reactivar un ítem dado de baja ocupa un lugar del límite del plan (maxStockItems). */
const validarReactivacion = async (cliente_id, id) => {
  const actual = await db.getItem(cliente_id, id);
  if (!actual) throw error(404, 'Ítem no encontrado', 'NO_ENCONTRADO');
  if (actual.activo) return;
  const { features, tierCode } = await planService.getClienteTierAndFeatures(cliente_id);
  const tope = features.maxStockItems;
  if (tope == null) return;
  const activos = (await db.listItems(cliente_id)).length;
  if (activos >= tope) {
    throw error(403, `Tu plan (${tierCode}) permite hasta ${tope} ítems de stock. Ya alcanzaste el límite.`, 'LIMITE_PLAN');
  }
};

const actualizarItem = async (cliente_id, id, body = {}) => {
  if (body.unidad !== undefined) throw bad('La unidad no se puede cambiar: creá un ítem nuevo', 'UNIDAD_FIJA');
  const cambios = {};
  if (body.nombre !== undefined) cambios.nombre = nombreValido(body.nombre);
  if (body.tipo !== undefined) {
    if (!TIPOS_ITEM.includes(body.tipo)) throw bad('tipo debe ser insumo o producto');
    cambios.tipo = body.tipo;
  }
  if (body.stock_minimo !== undefined) {
    cambios.stock_minimo = body.stock_minimo === null || body.stock_minimo === ''
      ? null : numero(body.stock_minimo, 'stock_minimo', { min: 0 });
  }
  if (body.activo !== undefined) {
    if (typeof body.activo !== 'boolean') throw bad('activo debe ser booleano');
    cambios.activo = body.activo;
  }
  if (!Object.keys(cambios).length) throw bad('No hay cambios para guardar');
  if (cambios.activo === true) await validarReactivacion(cliente_id, id);
  const ok = await db.updateItem(cliente_id, id, cambios).catch(conflictoNombre);
  if (!ok) throw error(404, 'Ítem no encontrado', 'NO_ENCONTRADO');
  return obtenerItem(cliente_id, id);
};

/** Baja lógica: el historial queda y el ítem deja de listarse y de contar para el límite. */
const desactivarItem = async (cliente_id, id) => {
  const ok = await db.updateItem(cliente_id, id, { activo: false });
  if (!ok) throw error(404, 'Ítem no encontrado', 'NO_ENCONTRADO');
  return { id, activo: false };
};

// ─── Movimientos ──────────────────────────────────────────────────────────

const itemParaMovimiento = async (cliente_id, stock_item_id) => {
  const id = Number(stock_item_id);
  if (!Number.isInteger(id) || id <= 0) throw bad('stock_item_id inválido');
  const item = await db.lockItem(cliente_id, id);
  if (!item) throw error(404, 'Ítem no encontrado', 'NO_ENCONTRADO');
  if (!item.activo) throw error(409, 'El ítem está dado de baja', 'ITEM_INACTIVO');
  return item;
};

/** Gasto en caja por la compra. Misma regla que /salida-caja: caja abierta si el comercio usa caja. */
const registrarGasto = async (cliente_id, usuario_id, item, cantidad, costo_total, medio_pago_id) => {
  if (medio_pago_id != null) {
    const validos = new Set(await salidaCajaDb.getMediosPagoIds());
    if (!(Number.isInteger(medio_pago_id) && validos.has(medio_pago_id))) throw bad('Medio de pago inválido');
  }
  let registro_diario_id = null;
  if (await salidaCajaDb.tenantUsaCaja(cliente_id)) {
    registro_diario_id = await db.getCajaAbiertaId(cliente_id);
    if (!registro_diario_id) {
      throw error(409, 'Para registrar la compra como gasto tenés que tener la caja abierta', 'CAJA_CERRADA');
    }
  }
  const categoria_salida_id = await db.getCategoriaTipoId('VAR');
  if (!categoria_salida_id) throw error(500, 'Falta la categoría de gasto variable (VAR)');
  return salidaCajaDb.createSalidaCaja({
    registro_diario_id,
    categoria_salida_id,
    descripcion: `Compra: ${item.nombre} (${cantidad} ${item.unidad})`.slice(0, 255),
    monto: costo_total,
    usuario_id,
    cliente_id,
    medio_pago_id: medio_pago_id ?? null,
  });
};

const compra = async (cliente_id, usuario_id, body, item) => {
  const cantidad = aUnidadDelItem(numero(body.cantidad, 'cantidad', { positivo: true }), body.unidad, item);
  if (!(cantidad > 0)) throw bad('La cantidad es demasiado chica para la unidad del ítem');
  const costo_total = body.costo_total == null || body.costo_total === ''
    ? null : redondear(numero(body.costo_total, 'costo_total', { min: 0 }), 2);
  const registrar = body.registrar_gasto === true;
  if (registrar && !(costo_total > 0)) throw bad('Para registrar el gasto la compra necesita un costo mayor a cero');

  const gasto = registrar
    ? await registrarGasto(cliente_id, usuario_id, item, cantidad, costo_total, body.medio_pago_id ?? null)
    : null;

  const movimiento = await db.insertMovimiento(cliente_id, {
    stock_item_id: item.id, tipo: 'compra', cantidad, costo_total,
    salida_caja_id: gasto?.id ?? null, usuario_id, nota: notaValida(body.nota),
  });
  if (costo_total > 0) await db.setCostoUnitario(cliente_id, item.id, redondear(costo_total / cantidad, 4));
  return { movimiento, gasto };
};

const merma = async (cliente_id, usuario_id, body, item) => {
  const cantidad = aUnidadDelItem(numero(body.cantidad, 'cantidad', { positivo: true }), body.unidad, item);
  if (!(cantidad > 0)) throw bad('La cantidad es demasiado chica para la unidad del ítem');
  const movimiento = await db.insertMovimiento(cliente_id, {
    stock_item_id: item.id, tipo: 'merma', cantidad: -cantidad, usuario_id, nota: notaValida(body.nota),
  });
  return { movimiento, gasto: null };
};

/** Conteo: el usuario dice cuánto hay y se asienta la diferencia. */
const ajuste = async (cliente_id, usuario_id, body, item) => {
  if (body.contado === undefined) throw bad('El ajuste necesita "contado" (lo que hay físicamente)');
  const contado = aUnidadDelItem(numero(body.contado, 'contado', { min: 0 }), body.unidad, item);
  const actual = await db.getStock(cliente_id, item.id);
  const delta = redondear(contado - actual);
  if (delta === 0) return { movimiento: null, gasto: null, sin_cambios: true };
  const movimiento = await db.insertMovimiento(cliente_id, {
    stock_item_id: item.id, tipo: 'ajuste', cantidad: delta, usuario_id,
    nota: notaValida(body.nota) ?? `Conteo: ${contado} ${item.unidad} (había ${actual})`,
  });
  return { movimiento, gasto: null };
};

const POR_TIPO = { compra, merma, ajuste };

/** Merma o conteo que deja el ítem bajo su mínimo: mismo aviso que una venta (Fase 3). */
const avisarSiCruza = async (cliente_id, item, movimiento, actualizado) => {
  if (!movimiento || !(Number(movimiento.cantidad) < 0) || item.stock_minimo == null) return;
  const actual = actualizado.stock;
  const previo = Math.round((actual - Number(movimiento.cantidad)) * 1000) / 1000;
  const minimo = Number(item.stock_minimo);
  if (!cruzaMinimo(previo, actual, minimo)) return;
  await avisosStock.avisarCruces(cliente_id, [
    { stock_item_id: item.id, nombre: item.nombre, unidad: item.unidad, previo, actual, minimo },
  ]);
};

const registrarMovimiento = async (cliente_id, usuario_id, body = {}) => {
  if (!usuario_id) throw error(401, 'Usuario no identificado');
  const handler = POR_TIPO[body.tipo];
  if (!handler) throw bad('tipo debe ser compra, merma o ajuste');
  const item = await itemParaMovimiento(cliente_id, body.stock_item_id);
  const r = await handler(cliente_id, usuario_id, body, item);
  const actualizado = await obtenerItem(cliente_id, item.id);
  await avisarSiCruza(cliente_id, item, r.movimiento, actualizado);
  return { ...r, item: actualizado };
};

const listarMovimientos = async (cliente_id, query = {}) => {
  const stock_item_id = query.stock_item_id == null || query.stock_item_id === ''
    ? null : Number(query.stock_item_id);
  if (stock_item_id !== null && !(Number.isInteger(stock_item_id) && stock_item_id > 0)) throw bad('stock_item_id inválido');
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 50, 1), 200);
  const offset = Math.max(parseInt(query.offset, 10) || 0, 0);
  const rows = await db.listMovimientos(cliente_id, { stock_item_id, limit, offset });
  return {
    data: rows.map((m) => ({ ...m, cantidad: Number(m.cantidad), costo_total: m.costo_total == null ? null : Number(m.costo_total) })),
    meta: { limit, offset },
  };
};

const listarAlertas = async (cliente_id) => {
  const rows = await db.listAlertas(cliente_id);
  return rows.map((r) => ({ ...conEstado(r), faltante: Number(r.faltante) }));
};

module.exports = {
  listarItems,
  obtenerItem,
  crearItem,
  actualizarItem,
  desactivarItem,
  registrarMovimiento,
  listarMovimientos,
  listarAlertas,
  _interno: { aUnidadDelItem, conEstado, nombreValido },
};
