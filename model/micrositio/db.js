// model/micrositio/db.js — queries del micrositio de pedidos.
// Corren dentro de la conexión de tenant (RLS) y además filtran por cliente_id.
const pool = require('../../pool');

const getProductosPorIds = async (cliente_id, ids) => {
  const result = await pool.query(
    `SELECT id, nombre, precio_unitario, permite_mitad
       FROM producto
      WHERE cliente_id = $1 AND id = ANY($2::int[])`,
    [cliente_id, ids]
  );
  return result.rows;
};

/** Caja abierta del comercio, sólo lectura (sin el "saneo" de check-caja). */
const getCajaAbierta = async (cliente_id) => {
  const result = await pool.query(
    `SELECT id, fecha, sucursal_id, usuario_apertura_id
       FROM registro_diario
      WHERE cliente_id = $1 AND caja_cerrada IS NULL
      ORDER BY fecha DESC, id DESC
      LIMIT 1`,
    [cliente_id]
  );
  return result.rows[0] || null;
};

const getMediosPago = async () => {
  const result = await pool.query(
    `SELECT id, descripcion, codigo FROM medio_pago ORDER BY id`
  );
  return result.rows;
};

module.exports = { getProductosPorIds, getCajaAbierta, getMediosPago };
