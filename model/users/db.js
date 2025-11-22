// db.js
const e = require('express');
const pool = require('../../pool');

const createUser = async (user) => {
  const { nombre, apellido, email, user_type_id,cliente_id } = user;
  const result = await pool.query(
    'INSERT INTO "user" (nombre, apellido, email, user_type_id,cliente_id) VALUES ($1, $2, $3, $4,$5) RETURNING *',
    [nombre, apellido, email, user_type_id, cliente_id]
  );
  return result.rows[0];
};

const getUserById = async (id,cliente_id) => {
  const result = await pool.query('SELECT * FROM "user" WHERE id = $1 and cliente_id =$2', [id,cliente_id]);
  return result;
};


const getUsers = async (cliente_id) => {
  const result = await pool.query('SELECT  u.*,ut.codigo as user_type_codigo,ut.descripcion as user_type_descripcion, p.telefono as telefono  FROM "user" u left join "user_type" ut on u.user_type_id=ut.id left join "profile" p on p.id_user =u.id where u.cliente_id =  $1' , [cliente_id]);
  return result;
}

const getUserTypeList = async () => {
  const result = await pool.query('SELECT id, descripcion, codigo FROM "user_type"  ', []);
  return result;
}


const updateUser = async (id, user) => {
  const { nombre, apellido, email, user_type_id } = user;
  const result = await pool.query(
    'UPDATE "user" SET nombre = $1, apellido = $2, email = $3, user_type_id = $4, updated_at = CURRENT_TIMESTAMP WHERE id = $5 RETURNING *',
    [nombre, apellido, email, user_type_id, id]
  );
  return result.rows[0];
};

const deleteUser = async (id,cliente_id) => {
  const client = await pool.connect();
    
  try {
    await client.query('BEGIN'); // Iniciar transacción

    // 1. Eliminar perfil (usando el mismo client)
    await client.query('DELETE FROM "profile" WHERE id_user = $1 and cliente_id =  $2', [id,cliente_id]);
    
    // 1. Eliminar perfil (usando el mismo client)
    await client.query('DELETE FROM "user_rol" WHERE id_user = $1 and cliente_id =  $2', [id,cliente_id]);

    // 2. Eliminar usuario (usando el mismo client)
    const result = await client.query('DELETE FROM "user" WHERE id = $1 and cliente_id =  $2 RETURNING *', [id,cliente_id]);
    
    await client.query('COMMIT'); // Confirmar transacción
    return result.rows[0];
    
  } catch (error) {
    await client.query('ROLLBACK'); // Revertir en caso de error
    throw error;
  } finally {
    client.release(); // Liberar conexión
  }
};

const getUserTypeById =  async (id) => {
  const result = await pool.query('SELECT descripcion as "descripcion" FROM "user_type" WHERE id = $1', [id]);
  return result;
};

const getUserRol =  async (id,cliente_id) => {
  const result = await pool.query('select r.descripcion,ur.id_rol,ur.id_user from "rol" r join "user_rol" ur on r.id = ur.id_rol join "user" u on u.id=ur.id_user where ur.id_user = $1 and ur.cliente_id = $2', [id,cliente_id]);
  return result;
};

const auth = async (email) => {
  const result = await pool.query('SELECT u.id as "id", u.email as "email" , p.password as "password", u."nombre",u."apellido", u.cliente_id as "cliente_id" FROM "user" u join "profile" p on u.id=p.id_user WHERE u.email = $1', [email]);
  return result.rows[0];
};

const getUserByTel =  async (telefono,cliente_id) => {
  const result = await pool.query('SELECT u."id",p."telefono",u."nombre",u."apellido",p.casa_nro,p.barrio from "profile" p join "user" u on u.id=p.id_user where p."telefono" = $1 and u.cliente_id = $2', [telefono,cliente_id]);
  return result;
}

const getEstadisticasCliente = async (userClienteId,cliente_id) => {
  const client = await pool.connect();
  
  try {
    // 1. Cantidad de pedidos
    const cantPedidosResult = await client.query(
      'SELECT COUNT(*) as cantidad FROM pedido WHERE user_cliente_id = $1 and cliente_id = $2',
      [userClienteId, cliente_id]
    );
    const cantidadPedidos = parseInt(cantPedidosResult.rows[0].cantidad);

    // 2. Total gastado
    const totalGastadoResult = await client.query(
      'SELECT COALESCE(SUM(monto_total), 0) as total FROM pedido WHERE user_cliente_id = $1',
      [userClienteId,cliente_id]
    );
    const totalGastado = parseFloat(totalGastadoResult.rows[0].total);

    // 3. Última compra
    const ultimaCompraResult = await client.query(
      'SELECT MAX(created_at) as ultima_compra FROM pedido WHERE user_cliente_id = $1 and cliente_id = $2',
      [userClienteId,cliente_id]
    );
    const ultimaCompra = ultimaCompraResult.rows[0].ultima_compra;

    // 4. Top 3 productos
    const topProductosResult = await client.query(`
      SELECT JSON_AGG(
        JSON_BUILD_OBJECT(
          'producto_id', producto_id,
          'producto_nombre', producto_nombre,
          'cantidad_total', cantidad_total,
          'veces_comprado', veces_comprado
        )
      ) as top_productos
      FROM (
        SELECT 
          pp.producto_id,
          pr.nombre as producto_nombre,
          SUM(pp.cantidad + pp.cantidad_mitad) as cantidad_total,
          COUNT(DISTINCT pp.pedido_id) as veces_comprado
        FROM pedido_producto pp
        INNER JOIN pedido p ON pp.pedido_id = p.id
        INNER JOIN producto pr ON pp.producto_id = pr.id
        WHERE p.user_cliente_id = $1 and p.cliente_id = $2
        GROUP BY pp.producto_id, pr.nombre
        ORDER BY cantidad_total DESC
        LIMIT 3
      ) sub
    `, [userClienteId,cliente_id]);
    const topProductos = topProductosResult.rows[0]?.top_productos || [];

    // 5. Top medio de pago
    const topMedioPagoResult = await client.query(`
      SELECT JSON_BUILD_OBJECT(
        'medio_pago_id', id,
        'medio_pago_descripcion', descripcion,
        'medio_pago_codigo', codigo,
        'veces_utilizado', veces_utilizado
      ) as top_medio_pago
      FROM (
        SELECT 
          mp.id,
          mp.descripcion,
          mp.codigo,
          COUNT(*) as veces_utilizado
        FROM medio_pago mp
        INNER JOIN pedido p ON p.medio_pago_id = mp.id
        WHERE p.user_cliente_id = $1 and p.cliente_id = $2
        GROUP BY mp.id, mp.descripcion, mp.codigo
        ORDER BY veces_utilizado DESC
        LIMIT 1
      ) sub
    `, [userClienteId]);
    const topMedioPago = topMedioPagoResult.rows[0]?.top_medio_pago || {};

    // Retornar todos los datos en un objeto
    return {
      cantidad_pedidos: cantidadPedidos,
      total_gastado: totalGastado,
      ultima_compra: ultimaCompra,
      top_3_productos: topProductos,
      top_medio_pago: topMedioPago
    };

  } catch (error) {
    console.error('Error obteniendo estadísticas del cliente:', error);
    throw error;
  } finally {
    client.release();
  }
};

const getUserModulosPermisos =  async (id,cliente_id) => {
  const { rows: userRoles } = await pool.query(
    `SELECT id_rol FROM user_rol WHERE id_user = $1 AND cliente_id = $2`,
    [id, cliente_id]
  );
  if (userRoles.length === 0) {
    return [];
  }

  //console.log("u r", userRoles);

  const roleIds = userRoles.map((r) => r.id_rol);
  const { rows: modulos } = await pool.query(
    `
    SELECT DISTINCT m.id AS modulo_id, m.descripcion AS modulo_descripcion, m.codigo AS modulo_codigo
    FROM modulo_rol mr
    INNER JOIN modulo m ON mr.id_modulo = m.id
    WHERE mr.id_rol = ANY($1::int[]) AND mr.cliente_id = $2
    `,
    [roleIds, cliente_id]
  );
  //console.log("modulos", modulos);
  // 🔹 Obtener permisos asociados a esos roles y módulos
  const { rows: permisos } = await pool.query(
    `
    SELECT DISTINCT 
      p.id AS permiso_id,
      p.descripcion AS permiso_descripcion,
      p.codigo AS permiso_codigo,
      p.modulo_id
    FROM rol_permiso rp
    INNER JOIN permiso p ON rp.permiso_id = p.id
    WHERE rp.rol_id = ANY($1::int[]) AND rp.cliente_id = $2
    `,
    [roleIds, cliente_id]
  );
  //console.log("per",permisos);
  // 🔹 Armar respuesta agrupada por módulo
  const response = modulos.map((modulo) => {
    const permisosModulo = permisos
      .filter((p) => p.modulo_id === modulo.modulo_id)
      .map((p) => ({
        id: p.permiso_id,
        descripcion: p.permiso_descripcion,
        codigo: p.permiso_codigo,
      }));

    return {
      modulo_id: modulo.modulo_id,
      modulo_descripcion: modulo.modulo_descripcion,
      modulo_codigo: modulo.modulo_codigo,
      permisos: permisosModulo,
    };
  });

  return response;
}


const postUserModulosPermisos = async (id,cliente_id,modulos) => {
  const client = await pool.connect();
 
  try {
    await client.query('BEGIN'); // Iniciar transacción

    // 1️⃣ Obtener roles del usuario
    const { rows: userRoles } = await client.query(
      `SELECT id_rol FROM user_rol WHERE id_user = $1 AND cliente_id = $2`,
      [id, cliente_id]
    );

    if (userRoles.length === 0) {
      throw new Error('El usuario no tiene roles asignados');
    }

    const roleIds = userRoles.map((r) => r.id_rol);

    // 2️⃣ Limpiar permisos y módulos actuales asociados a estos roles
    await client.query(
      `DELETE FROM rol_permiso WHERE rol_id = ANY($1::int[])`,
      [roleIds]
    );

    await client.query(
      `DELETE FROM modulo_rol WHERE id_rol = ANY($1::int[])`,
      [roleIds]
    );
    console.log("modulos db",modulos);
    // 3️⃣ Registrar nuevos módulos y permisos
    for (const item of modulos) {
      const { modulo_id, permisos } = item;

      for (const roleId of roleIds) {
        // Asignar módulo al rol
        await client.query(
          `INSERT INTO modulo_rol (id_modulo, id_rol, cliente_id) VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING`,
          [modulo_id, roleId, cliente_id]
        );

        // Asignar permisos al rol
        for (const permisoId of permisos) {
          await client.query(
            `INSERT INTO rol_permiso (rol_id, permiso_id, cliente_id) VALUES ($1, $2, $3)
             ON CONFLICT DO NOTHING`,
            [roleId, permisoId, cliente_id]
          );
        }
      }
    }
    await client.query('COMMIT');
    // ✅ Respuesta exitosa
    return {
      ok: true,
      message: 'Módulos y permisos asignados correctamente',
    };
    
  } catch (error) {
    await client.query('ROLLBACK'); // Revertir en caso de error
    console.error('Error en transacción:', error);
    throw error;
  } finally {
    client.release(); // Liberar conexión
  }
};




module.exports = {
    createUser,
    getUserById,
    getUsers,
    updateUser,
    deleteUser,
    auth,
    getUserTypeById,
    getUserRol,
    getUserByTel,
    getUserTypeList,
    getEstadisticasCliente,
    getUserModulosPermisos,
    postUserModulosPermisos
  };