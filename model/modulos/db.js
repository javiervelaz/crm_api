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


  const getPermisosByModuloId = async (cliente_id, id_modulo) => {
    const query = `
      SELECT 
        p.id,
        p.codigo,
        p.descripcion,
        p.modulo_id,
        p.cliente_id
      FROM permiso p
      WHERE p.modulo_id = $1 AND p.cliente_id = $2
      ORDER BY p.descripcion;
    `;
    return pool.query(query, [id_modulo, cliente_id]);
  };
  
  // ¿El código pertenece a la plantilla del rubro del tenant?
  // Evita que un tenant se "instale" un módulo de otro rubro creando la fila
  // a mano (ej. una pizzería creando 'alumnos' y asignándoselo a un rol).
  const isCodigoEnRubroDelCliente = async (cliente_id, codigo) => {
    const result = await pool.query(
      `SELECT 1
         FROM cliente c
         JOIN rubro_modulo_maestro rmm ON rmm.rubro_codigo = c.rubro_codigo
         JOIN modulo_maestro mm        ON mm.id = rmm.modulo_maestro_id
        WHERE c.id = $1 AND mm.codigo = $2 AND mm.status = true`,
      [cliente_id, codigo]
    );
    return result.rowCount > 0;
  };

  module.exports = {
    isCodigoEnRubroDelCliente,
    createModulo,
    getModuloById,
    getModulos,
    updateModulo,
    deleteModulo,
    getPermisosByModuloId
    // Exporta las otras funciones aquí...
  };