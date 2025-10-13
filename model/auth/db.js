const pool = require('../../pool');

// Obtener roles de un usuario
const getUserRoles = async (userId, clienteId) => {
  const result = await pool.query(
    `SELECT r.id, r.descripcion
     FROM user_rol ur
     JOIN rol r ON ur.id_rol = r.id
     WHERE ur.id_user = $1 AND ur.cliente_id = $2`,
    [userId, clienteId]
  );
  return result.rows;
};

// Obtener módulos de un usuario a través de sus roles
const getUserModules = async (userId, clienteId) => {
  const result = await pool.query(
    `SELECT DISTINCT m.codigo
     FROM user_rol ur
     JOIN modulo_rol mr ON ur.id_rol = mr.id_rol AND ur.cliente_id = mr.cliente_id
     JOIN modulo m ON mr.id_modulo = m.id AND mr.cliente_id = m.cliente_id
     WHERE ur.id_user = $1 AND ur.cliente_id = $2`,
    [userId, clienteId]
  );
  return result.rows.map(r => r.codigo);
};

module.exports = { getUserRoles, getUserModules };
