// model/harness/consultas.js — consultas del harness interno.
//
// Propias (no los reportes de /api/reportes): devuelven `numeric` como string
// (nunca float8) para que la plata llegue exacta al usuario.
//
// Regla de oro: TODA consulta filtra por cliente_id ($1) explícitamente. En
// producción no hay RLS activo, así que el aislamiento depende de esto
// (tests/harnessAislamiento.test.js lo verifica por inspección del SQL).
// Los días son locales del tenant (utils/fechaTenant); desde/hasta = 'YYYY-MM-DD'.

const pool = require('../../pool');
const { fechaLocalSql } = require('../../utils/fechaTenant');

const dia = (col) => fechaLocalSql(col, '$1');

const ventasTotales = async (clienteId, desde, hasta) => {
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(p.monto_total), 0)::text AS total, COUNT(*)::int AS pedidos,
            COALESCE(ROUND(AVG(p.monto_total), 2), 0)::text AS ticket
       FROM pedido p
      WHERE p.cliente_id = $1 AND ${dia('p.created_at')} BETWEEN $2::date AND $3::date`,
    [clienteId, desde, hasta],
  );
  return rows[0];
};

const ventasMejorDia = async (clienteId, desde, hasta) => {
  const { rows } = await pool.query(
    `SELECT ${dia('p.created_at')}::text AS fecha, SUM(p.monto_total)::text AS total
       FROM pedido p
      WHERE p.cliente_id = $1 AND ${dia('p.created_at')} BETWEEN $2::date AND $3::date
      GROUP BY 1 ORDER BY SUM(p.monto_total) DESC, 1 LIMIT 1`,
    [clienteId, desde, hasta],
  );
  return rows[0] || null;
};

const productosDelComercio = async (clienteId) => {
  const { rows } = await pool.query(
    'SELECT id, nombre FROM producto WHERE cliente_id = $1 ORDER BY nombre',
    [clienteId],
  );
  return rows;
};

const ventasPorProductos = async (clienteId, productoIds, desde, hasta) => {
  const { rows } = await pool.query(
    `SELECT pr.id, pr.nombre,
            COALESCE(SUM(pp.cantidad), 0)::int AS unidades,
            COALESCE(SUM(pp.cantidad * pp.precio_unitario), 0)::text AS total
       FROM producto pr
       LEFT JOIN pedido_producto pp ON pp.producto_id = pr.id
       LEFT JOIN pedido p ON p.id = pp.pedido_id AND p.cliente_id = $1
            AND ${dia('p.created_at')} BETWEEN $3::date AND $4::date
      WHERE pr.cliente_id = $1 AND pr.id = ANY($2::int[])
        AND (pp.id IS NULL OR p.id IS NOT NULL)
      GROUP BY pr.id, pr.nombre ORDER BY unidades DESC, pr.nombre`,
    [clienteId, productoIds, desde, hasta],
  );
  return rows;
};

const gastosPorTipo = async (clienteId, desde, hasta) => {
  // salida_caja.categoria_salida_id guarda categoria_tipo.id (nombre histórico; FK en migración 021)
  const { rows } = await pool.query(
    `SELECT ct.codigo, ct.descripcion AS tipo, SUM(s.monto)::text AS total, COUNT(*)::int AS cantidad
       FROM salida_caja s
       JOIN categoria_tipo ct ON ct.id = s.categoria_salida_id
      WHERE s.cliente_id = $1 AND ${dia('s.created_at')} BETWEEN $2::date AND $3::date
      GROUP BY ct.codigo, ct.descripcion ORDER BY SUM(s.monto) DESC`,
    [clienteId, desde, hasta],
  );
  return rows;
};

const gastosTotal = async (clienteId, desde, hasta) => {
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(s.monto), 0)::text AS total
       FROM salida_caja s
      WHERE s.cliente_id = $1 AND ${dia('s.created_at')} BETWEEN $2::date AND $3::date`,
    [clienteId, desde, hasta],
  );
  return rows[0].total;
};

const gastosPorDescripcion = async (clienteId, desde, hasta, { codigoTipo = null, limite = 5 } = {}) => {
  const { rows } = await pool.query(
    `SELECT COALESCE(NULLIF(btrim(s.descripcion), ''), 'Sin detalle') AS detalle,
            SUM(s.monto)::text AS total
       FROM salida_caja s
       JOIN categoria_tipo ct ON ct.id = s.categoria_salida_id
      WHERE s.cliente_id = $1 AND ${dia('s.created_at')} BETWEEN $2::date AND $3::date
        AND ($4::text IS NULL OR ct.codigo = $4::text)
      GROUP BY 1 ORDER BY SUM(s.monto) DESC, 1 LIMIT $5`,
    [clienteId, desde, hasta, codigoTipo, limite],
  );
  return rows;
};

const clientesNuevos = async (clienteId, desde, hasta) => {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS nuevos
       FROM "user" u JOIN user_type ut ON ut.id = u.user_type_id
      WHERE u.cliente_id = $1 AND ut.codigo = 'CLI' AND u.deleted_at IS NULL
        AND ${dia('u.created_at')} BETWEEN $2::date AND $3::date`,
    [clienteId, desde, hasta],
  );
  return rows[0].nuevos;
};

module.exports = {
  ventasTotales, ventasMejorDia, productosDelComercio, ventasPorProductos,
  gastosPorTipo, gastosTotal, gastosPorDescripcion, clientesNuevos,
};
