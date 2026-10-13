// db.js
const pool = require('../../pool');

const createUserRol = async (rol) => {
    const { id_rol, id_user ,cliente_id} = rol;
    const result = await pool.query(
      'INSERT INTO "user_rol" (id_rol, id_user, cliente_id) VALUES ($1,$2,$3) RETURNING *',
      [id_rol, id_user,cliente_id]
    );
    return result.rows[0];
  }
  
  const getUserRolById = async (id,cliente_id) => {
    const result = await pool.query('SELECT * FROM "user_rol" WHERE id = $1 and cliente_id = $2', [id,cliente_id]);
    return result.rows[0];
  }
  
  const getUserRols = async (cliente_id) => {
    const result = await pool.query('SELECT * FROM "user_rol" where cliente_id =$1 ', [cliente_id]);
    return result;
  }
  
  const updateUserRol = async (id, rol) => {
    const { id_rol,cliente_id } = rol;
    const query = `
      UPDATE "user_rol" SET id_rol =  $1  WHERE id = $3 and cliente_id =$2 RETURNING *
    `;
    const result = await pool.query(
      query,
      [id_rol,cliente_id,id]
    );
    return result.rows[0];
  };

  const deleteUserRol = async (id,cliente_id) => {
    const result = await pool.query('DELETE FROM "user_rol" WHERE id = $1 and cliente_id = $2 RETURNING *', [id,cliente_id]);
    return result.rows[0];
  };

  // Devuelve id e id_rol además de la descripción: la pantalla de edición los
  // necesita para borrar el rol que se destilda (CP-10: sólo venía la
  // descripción, así que nunca se borraba y cada guardado duplicaba roles).
  const getUserRoleByUserId = async (id,cliente_id) => {
    const query = `
    SELECT ur.id, ur.id_rol, ur.id_user, r.descripcion FROM "user_rol" ur
    inner join "rol" r on r.id = ur.id_rol
    WHERE ur.id_user = $1 and  ur.cliente_id =  $2 
    order by ur."id_rol"
    `;
    const result = await pool.query(query, [id,cliente_id]);
    return result.rows;
  };
  
  // Validaciones de pertenencia: un rol o un usuario de otro tenant no se puede
  // asignar (antes el INSERT aceptaba cualquier id).
  const userRolExistente = async (id_user, id_rol, cliente_id) => {
    const result = await pool.query(
      'SELECT * FROM "user_rol" WHERE id_user = $1 AND id_rol = $2 AND cliente_id = $3 ORDER BY id LIMIT 1',
      [id_user, id_rol, cliente_id]
    );
    return result.rows[0] || null;
  };

  const rolDelTenant = async (id_rol, cliente_id) => {
    const result = await pool.query('SELECT id FROM rol WHERE id = $1 AND cliente_id = $2', [id_rol, cliente_id]);
    return result.rows[0] || null;
  };

  const userDelTenant = async (id_user, cliente_id) => {
    const result = await pool.query('SELECT id FROM "user" WHERE id = $1 AND cliente_id = $2', [id_user, cliente_id]);
    return result.rows[0] || null;
  };

  module.exports = {
    rolDelTenant,
    userDelTenant,
    userRolExistente,
    createUserRol,
    getUserRolById,
    getUserRols,
    updateUserRol,
    deleteUserRol,
    getUserRoleByUserId
    // Exporta las otras funciones aquí...
  };