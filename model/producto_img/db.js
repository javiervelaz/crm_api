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

exports.findByProductoId = async (productoId) => {
  const result = await pool.query(
    `
    SELECT id, producto_id, nombre, descripcion
    FROM producto_img
    WHERE producto_id = $1
    ORDER BY id
    `,
    [productoId]
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

exports.delete = async (id) => {
  await pool.query(`DELETE FROM producto_img WHERE id = $1`, [id]);
};
