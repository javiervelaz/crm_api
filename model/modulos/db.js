// db.js
const pool = require('../../pool');

const createModulo = async (Modulo) => {
    const { codigo,descripcion, status,cliente_id } = Modulo;
    const result = await pool.query(
      'INSERT INTO modulo (codigo,descripcion,status,cliente_id) VALUES ($1,$2,$3,$4) RETURNING *',
      [codigo,descripcion, status,cliente_id]
    );
    return result.rows[0];
  }
  
  const getModuloById = async (id,cliente_id) => {
    const result = await pool.query('SELECT * FROM "modulo" WHERE id = $1 and cliente_id = $2', [id,cliente_id]);
    return result.rows[0];
  }
  
  const getModulos = async (cliente_id) => {
    const result = await pool.query('SELECT * FROM "modulo" where cliente_id = $1', [cliente_id]);
    return result.rows;
  }
  
  const updateModulo = async (id, Modulo) => {
    const { codigo,descripcion,status,cliente_id } = Modulo;
    const query = `
      UPDATE modulo SET 
        codigo = COALESCE($1,codigo), 
        descripcion = COALESCE($2,descripcion),
        status = COALESCE($3, status),
        updated_at = CURRENT_TIMESTAMP 
        WHERE id = $5 and cliente_id = $4 RETURNING *
    `;
    const result = await pool.query(
      query,
      [codigo,descripcion,status,cliente_id, id]
    );
    return result.rows[0];
  };

  const deleteModulo = async (id,cliente_id) => {
    const result = await pool.query('DELETE FROM modulo WHERE id = $1 and cliente_id= $2 RETURNING *', [id,cliente_id]);
    return result.rows[0];
  };
  
  module.exports = {
    createModulo,
    getModuloById,
    getModulos,
    updateModulo,
    deleteModulo
    // Exporta las otras funciones aquí...
  };