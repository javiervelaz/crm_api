const pool = require('../../pool');

exports.insert = async ({ producto_id, nombre, descripcion }) => {
  const result = await pool.query(
    `
    INSERT INTO producto_img (producto_id, nombre, descripcion)
    VALUES ($1, $2, $3)
    RETURNING id, producto_id, nombre, descripcion
    `,
    [producto_id, nombre, descripcion]
  );
  return result.rows[0];
};

exports.findByProductoId = async (productoId, clienteId) => {
  const result = await pool.query(
    `SELECT pi.id, pi.producto_id, pi.nombre, pi.descripcion
       FROM producto_img pi
       JOIN producto p ON p.id = pi.producto_id
      WHERE pi.producto_id = $1 AND p.cliente_id = $2::int
      ORDER BY pi.id`,
    [productoId, clienteId]
  );
  return result.rows;
};

exports.findById = async (id) => {
  const result = await pool.query(
    `
    SELECT id, producto_id, nombre, descripcion
    FROM producto_img
    WHERE id = $1
    `,
    [id]
  );
  return result.rows[0];
};

exports.delete = async (imgId, clienteId) => {
  const result = await pool.query(
    `DELETE FROM producto_img
      WHERE id = $1
        AND producto_id IN (SELECT id FROM producto WHERE cliente_id = $2::int)
      RETURNING *`,
    [imgId, clienteId]
  );
  return result.rows[0];
};
