// model/inventario/db.js — ítems de stock y su ledger (migraciones 025/026).
//
// Todas las queries filtran por cliente_id (sin RLS en prod, es el único
// aislamiento). Corren dentro de la transacción del request (pool proxy +
// withTenantConnection): un movimiento y su gasto se confirman o caen juntos.
const pool = require('../../pool');

const COLS_ITEM = `id, nombre, tipo, unidad, stock_minimo, costo_unitario, activo, stock, created_at, updated_at`;

// Saldo < mínimo. Un ítem sin mínimo nunca alerta.
const BAJO_MINIMO = `stock_minimo IS NOT NULL AND stock < stock_minimo`;

const listItems = async (cliente_id, { tipo = null, bajoMinimo = false, incluirInactivos = false, q = null } = {}) => {
  const { rows } = await pool.query(
    `SELECT ${COLS_ITEM}
       FROM stock_saldo
      WHERE cliente_id = $1
        AND ($2::text IS NULL OR tipo = $2)
        AND ($3::boolean = false OR (${BAJO_MINIMO}))
        AND ($4::boolean = true OR activo = true)
        AND ($5::text IS NULL OR nombre ILIKE '%' || $5 || '%')
      ORDER BY lower(nombre)`,
    [cliente_id, tipo, bajoMinimo, incluirInactivos, q]
  );
  return rows;
};

const getItem = async (cliente_id, id) => {
  const { rows } = await pool.query(
    `SELECT ${COLS_ITEM} FROM stock_saldo WHERE cliente_id = $1 AND id = $2`,
    [cliente_id, id]
  );
  return rows[0] || null;
};

/** Bloquea la fila del ítem hasta el fin de la transacción (conteos simultáneos). */
const lockItem = async (cliente_id, id) => {
  const { rows } = await pool.query(
    `SELECT id, nombre, unidad, activo FROM stock_item WHERE cliente_id = $1 AND id = $2 FOR UPDATE`,
    [cliente_id, id]
  );
  return rows[0] || null;
};

const getStock = async (cliente_id, stock_item_id) => {
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(cantidad), 0)::numeric AS stock
       FROM stock_movimiento WHERE cliente_id = $1 AND stock_item_id = $2`,
    [cliente_id, stock_item_id]
  );
  return Number(rows[0].stock);
};

const createItem = async (cliente_id, { nombre, tipo, unidad, stock_minimo = null }) => {
  const { rows } = await pool.query(
    `INSERT INTO stock_item (cliente_id, nombre, tipo, unidad, stock_minimo)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [cliente_id, nombre, tipo, unidad, stock_minimo]
  );
  return rows[0].id;
};

/** Update parcial. La unidad no se cambia: reinterpretaría todo el historial. */
const updateItem = async (cliente_id, id, { nombre = null, tipo = null, stock_minimo, activo = null }) => {
  const tocaMinimo = stock_minimo !== undefined;
  const { rowCount } = await pool.query(
    `UPDATE stock_item SET
        nombre       = COALESCE($3, nombre),
        tipo         = COALESCE($4, tipo),
        stock_minimo = CASE WHEN $5::boolean THEN $6::numeric ELSE stock_minimo END,
        activo       = COALESCE($7, activo),
        updated_at   = CURRENT_TIMESTAMP
      WHERE cliente_id = $1 AND id = $2`,
    [cliente_id, id, nombre, tipo, tocaMinimo, tocaMinimo ? stock_minimo : null, activo]
  );
  return rowCount > 0;
};

const setCostoUnitario = async (cliente_id, id, costo_unitario) => {
  await pool.query(
    `UPDATE stock_item SET costo_unitario = $3, updated_at = CURRENT_TIMESTAMP
      WHERE cliente_id = $1 AND id = $2`,
    [cliente_id, id, costo_unitario]
  );
};

const insertMovimiento = async (cliente_id, m) => {
  const { rows } = await pool.query(
    `INSERT INTO stock_movimiento
       (cliente_id, stock_item_id, tipo, cantidad, costo_total, pedido_id, salida_caja_id, usuario_id, nota)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [cliente_id, m.stock_item_id, m.tipo, m.cantidad, m.costo_total ?? null,
      m.pedido_id ?? null, m.salida_caja_id ?? null, m.usuario_id, m.nota ?? null]
  );
  return rows[0];
};

const listMovimientos = async (cliente_id, { stock_item_id = null, limit = 50, offset = 0 } = {}) => {
  const { rows } = await pool.query(
    `SELECT m.id, m.stock_item_id, i.nombre AS item, i.unidad, m.tipo, m.cantidad, m.costo_total,
            m.pedido_id, m.salida_caja_id, m.nota, m.created_at, u.nombre AS usuario
       FROM stock_movimiento m
       JOIN stock_item i ON i.id = m.stock_item_id AND i.cliente_id = m.cliente_id
       LEFT JOIN "user" u ON u.id = m.usuario_id
      WHERE m.cliente_id = $1
        AND ($2::int IS NULL OR m.stock_item_id = $2)
      ORDER BY m.created_at DESC, m.id DESC
      LIMIT $3 OFFSET $4`,
    [cliente_id, stock_item_id, limit, offset]
  );
  return rows;
};

const listAlertas = async (cliente_id) => {
  const { rows } = await pool.query(
    `SELECT ${COLS_ITEM}, (stock_minimo - stock) AS faltante
       FROM stock_saldo
      WHERE cliente_id = $1 AND activo = true AND ${BAJO_MINIMO}
      ORDER BY (stock <= 0) DESC, lower(nombre)`,
    [cliente_id]
  );
  return rows;
};

/** Caja abierta más reciente del comercio (misma definición que la app). */
const getCajaAbiertaId = async (cliente_id) => {
  const { rows } = await pool.query(
    `SELECT id FROM registro_diario
      WHERE cliente_id = $1 AND caja_cerrada IS NULL
      ORDER BY fecha DESC, id DESC LIMIT 1`,
    [cliente_id]
  );
  return rows[0]?.id ?? null;
};

/** Catálogo global (sin cliente_id): id de categoria_tipo para un código (FI/VAR/SU). */
const getCategoriaTipoId = async (codigo) => {
  const { rows } = await pool.query(`SELECT id FROM categoria_tipo WHERE codigo = $1`, [codigo]);
  return rows[0]?.id ?? null;
};

// ─── Recetas (Fase 2) ─────────────────────────────────────────────────────

const getProducto = async (cliente_id, producto_id) => {
  const { rows } = await pool.query(
    `SELECT id, nombre, permite_mitad FROM producto WHERE cliente_id = $1 AND id = $2`,
    [cliente_id, producto_id]
  );
  return rows[0] || null;
};

/** Productos del comercio con su receta resumida (para la pantalla de recetas). */
const listProductosConReceta = async (cliente_id) => {
  const { rows } = await pool.query(
    `SELECT p.id, p.nombre, p.permite_mitad,
            COALESCE(json_agg(json_build_object(
              'stock_item_id', i.id, 'nombre', i.nombre, 'tipo', i.tipo, 'unidad', i.unidad,
              'cantidad_por_unidad', r.cantidad_por_unidad, 'activo', i.activo
            ) ORDER BY lower(i.nombre)) FILTER (WHERE r.id IS NOT NULL), '[]') AS receta
       FROM producto p
       LEFT JOIN receta r     ON r.producto_id = p.id AND r.cliente_id = p.cliente_id
       LEFT JOIN stock_item i ON i.id = r.stock_item_id AND i.cliente_id = r.cliente_id
      WHERE p.cliente_id = $1
      GROUP BY p.id
      ORDER BY lower(p.nombre)`,
    [cliente_id]
  );
  return rows;
};

const getReceta = async (cliente_id, producto_id) => {
  const { rows } = await pool.query(
    `SELECT r.stock_item_id, i.nombre, i.tipo, i.unidad, i.activo, r.cantidad_por_unidad
       FROM receta r
       JOIN stock_item i ON i.id = r.stock_item_id AND i.cliente_id = r.cliente_id
      WHERE r.cliente_id = $1 AND r.producto_id = $2
      ORDER BY lower(i.nombre)`,
    [cliente_id, producto_id]
  );
  return rows;
};

/** Ítems del comercio por id (para validar una receta antes de guardarla). */
const getItemsPorIds = async (cliente_id, ids) => {
  const { rows } = await pool.query(
    `SELECT id, nombre, tipo, unidad, activo FROM stock_item WHERE cliente_id = $1 AND id = ANY($2::int[])`,
    [cliente_id, ids]
  );
  return rows;
};

/** Reemplaza la receta completa del producto (lista vacía = sin receta). */
const replaceReceta = async (cliente_id, producto_id, lineas) => {
  await pool.query(`DELETE FROM receta WHERE cliente_id = $1 AND producto_id = $2`, [cliente_id, producto_id]);
  if (!lineas.length) return;
  await pool.query(
    `INSERT INTO receta (cliente_id, producto_id, stock_item_id, cantidad_por_unidad)
     SELECT $1, $2, x.stock_item_id, x.cantidad
       FROM UNNEST($3::int[], $4::numeric[]) AS x(stock_item_id, cantidad)`,
    [cliente_id, producto_id, lineas.map((l) => l.stock_item_id), lineas.map((l) => l.cantidad_por_unidad)]
  );
};

/** Recetas de varios productos, sólo con ítems activos (lo que descuenta una venta). */
const getRecetasPorProductos = async (cliente_id, producto_ids) => {
  const { rows } = await pool.query(
    `SELECT r.producto_id, r.stock_item_id, r.cantidad_por_unidad, i.nombre, i.unidad, i.stock_minimo
       FROM receta r
       JOIN stock_item i ON i.id = r.stock_item_id AND i.cliente_id = r.cliente_id AND i.activo = true
      WHERE r.cliente_id = $1 AND r.producto_id = ANY($2::int[])`,
    [cliente_id, producto_ids]
  );
  return rows;
};

/** Neto descontado por ítem para un pedido (venta + reversa_venta). */
const getNetoVentaPorPedido = async (cliente_id, pedido_id) => {
  const { rows } = await pool.query(
    `SELECT stock_item_id, SUM(cantidad)::numeric AS neto
       FROM stock_movimiento
      WHERE cliente_id = $1 AND pedido_id = $2 AND tipo IN ('venta', 'reversa_venta')
      GROUP BY stock_item_id`,
    [cliente_id, pedido_id]
  );
  return rows.map((r) => ({ stock_item_id: r.stock_item_id, neto: Number(r.neto) }));
};

/** Saldos actuales de varios ítems (para detectar cruces del mínimo). */
const getStocks = async (cliente_id, ids) => {
  const { rows } = await pool.query(
    `SELECT stock_item_id, COALESCE(SUM(cantidad), 0)::numeric AS stock
       FROM stock_movimiento
      WHERE cliente_id = $1 AND stock_item_id = ANY($2::int[])
      GROUP BY stock_item_id`,
    [cliente_id, ids]
  );
  return new Map(rows.map((r) => [r.stock_item_id, Number(r.stock)]));
};

/** ¿El comercio tiene el módulo inventario activo? */
const tenantUsaInventario = async (cliente_id) => {
  const { rows } = await pool.query(
    `SELECT EXISTS (
       SELECT 1 FROM modulo
        WHERE cliente_id = $1 AND codigo = 'inventario' AND status = true AND deleted_at IS NULL
     ) AS usa`,
    [cliente_id]
  );
  return rows[0].usa === true;
};

module.exports = {
  listItems,
  getItem,
  lockItem,
  getStock,
  createItem,
  updateItem,
  setCostoUnitario,
  insertMovimiento,
  listMovimientos,
  listAlertas,
  getCajaAbiertaId,
  getCategoriaTipoId,
  getProducto,
  listProductosConReceta,
  getReceta,
  getItemsPorIds,
  replaceReceta,
  getRecetasPorProductos,
  getNetoVentaPorPedido,
  getStocks,
  tenantUsaInventario,
};
