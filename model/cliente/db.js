const e = require('express');
const db = require('../../model/cliente/db');
const pool = require('../../pool'); // asegurate que esto está arriba del archivo

const createCliente = async (data) => {
  const {
    nombre,
    cuit,
    adminNombre,
    adminApellido,
    adminEmail,
    adminDni,
  } = data;
 
  if (!nombre || !cuit) {
    throw new Error('nombre y cuit son obligatorios');
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1) Crear cliente
    const clienteRes = await client.query(
      'INSERT INTO cliente (nombre, cuit) VALUES ($1, $2) RETURNING *',
      [nombre, cuit]
    );
    const cliente = clienteRes.rows[0];

    // 2) Traer TODOS los user_type
    const userTypesRes = await client.query(
      'SELECT id, codigo, descripcion FROM "user_type"'
    );
    const userTypes = userTypesRes.rows;

    if (userTypes.length === 0) {
      throw new Error('No hay registros en user_type (admin, empleado, proveedor, cliente, etc.)');
    }

    // 2.a) Buscar el user_type 'admin' para el usuario
    const adminUserType = userTypes.find((ut) => ut.codigo === 'ADMIN');
    if (!adminUserType) {
      throw new Error('user_type "admin" no está configurado en user_type');
    }
    const userTypeId = adminUserType.id;

    // 3) Crear user admin
    const userNombre = adminNombre || 'Admin';
    const userApellido = adminApellido || cliente.nombre;
    const userEmail =
      adminEmail ||
      `admin+${cliente.id}@${(cliente.nombre || 'cliente')
        .toLowerCase()
        .replace(/\s+/g, '')}.local`;
    const dni = adminDni || 0; // NOT NULL en profile, usamos 0 por defecto
    const userRes = await client.query(
      `
      INSERT INTO "user" (nombre, apellido, email, user_type_id, cliente_id)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
      `,
      [userNombre, userApellido, userEmail, userTypeId, cliente.id]
    );
    const user = userRes.rows[0];

    // 4) Crear profile para el user admin
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const legajo = `ADMIN-${cliente.id}`;

    await client.query(
      `
      INSERT INTO "profile"
        (id_user, dni, telefono, password, legajo, fecha_ingreso, casa_nro, barrio, cliente_id)
      VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `,
      [
        user.id,
        dni,
        null,       // telefono
        '$2b$10$sLx72Xcw0uhZpxT9PXEKQ.zC7bjzUZbDCcF3UXvXVj4QH.qLNYQP2',   // password por ahora fijo
        legajo,
        today,      // fecha_ingreso
        null,       // casa_nro
        null,       // barrio
        cliente.id,
      ]
    );

    // 5) Crear ROLES por cada user_type para este cliente
    const rolesCliente = [];
    let rolAdmin = null;

    for (const ut of userTypes) {
      const descRol = ut.descripcion || ut.codigo;

      const rolRes = await client.query(
        `
        INSERT INTO rol (descripcion, cliente_id)
        VALUES ($1, $2)
        RETURNING *
        `,
        [descRol, cliente.id]
      );
      const rol = rolRes.rows[0];
      rolesCliente.push(rol);

      // asociar TODOS los roles al usuario admin
      await client.query(
        `
        INSERT INTO user_rol (id_rol, id_user, cliente_id)
        VALUES ($1, $2, $3)
        `,
        [rol.id, user.id, cliente.id]
      );

      // identificamos cuál es el rol "admin" (para permisos/módulos)
      if (ut.codigo === 'admin') {
        rolAdmin = rol;
      }
    }

    if (!rolAdmin) {
      // fallback paranoico: por las dudas
      rolAdmin = rolesCliente[0];
    }

    // 6) Instanciar módulos desde modulo_maestro
    const moduloMaestroRes = await client.query(
      `
      SELECT codigo, descripcion, status
      FROM modulo_maestro
      WHERE status = true
      `
    );
    const modulosMaestro = moduloMaestroRes.rows;

    const modulosCliente = [];
    for (const mm of modulosMaestro) {
      const mRes = await client.query(
        `
        INSERT INTO modulo (codigo, descripcion, status, cliente_id)
        VALUES ($1, $2, $3, $4)
        RETURNING *
        `,
        [mm.codigo, mm.descripcion, mm.status, cliente.id]
      );
      const modulo = mRes.rows[0];
      modulosCliente.push(modulo);

      // módulo ↔ rol admin (el rol ADMIN tiene todos los módulos)
      await client.query(
        `
        INSERT INTO modulo_rol (id_rol, id_modulo, cliente_id)
        VALUES ($1, $2, $3)
        `,
        [rolAdmin.id, modulo.id, cliente.id]
      );
    }

    // 7) Traer acciones posibles (list, create, update, delete)
    const accionesRes = await client.query(
      `
      SELECT id, codigo, descripcion
      FROM permiso_accion
      ORDER BY id
      `
    );
    const acciones = accionesRes.rows;

    // 8) Crear permisos (modulo × accion) y asignarlos al rol admin
    const permisosCreados = [];

    for (const modulo of modulosCliente) {
      for (const acc of acciones) {
        const codigoPermiso = `${modulo.codigo}.${acc.codigo}`; // ej: usuarios.list
        const descPermiso = `${acc.descripcion} - ${modulo.descripcion}`;

        const permRes = await client.query(
          `
          INSERT INTO permiso (descripcion, codigo, modulo_id, cliente_id, es_global)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING *
          `,
          [descPermiso, codigoPermiso, modulo.id, cliente.id, false]
        );
        const permiso = permRes.rows[0];
        permisosCreados.push(permiso);

        // vincular permiso ↔ rol admin
        await client.query(
          `
          INSERT INTO rol_permiso (rol_id, permiso_id, cliente_id)
          VALUES ($1, $2, $3)
          `,
          [rolAdmin.id, permiso.id, cliente.id]
        );
      }
    }

    await client.query('COMMIT');

    return {
      cliente,
      adminUser: {
        id: user.id,
        nombre: user.nombre,
        apellido: user.apellido,
        email: user.email,
      },
      roles: rolesCliente.map((r) => ({
        id: r.id,
        descripcion: r.descripcion,
      })),
      modulos: modulosCliente.map((m) => ({
        id: m.id,
        codigo: m.codigo,
        descripcion: m.descripcion,
      })),
    };
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error en createClienteService:', err);
    throw err;
  } finally {
    client.release();
  }
};


// el resto de funciones quedan como estaban
const getClienteById = async (id, cliente_id) => {
  const result = await db.getClienteById(id, cliente_id);
  return result;
};

// TODO: completar estas si las usás en otros lados
// las dejo mínimas para no inventar de más
const getClienteList = async () => {
  const result = await pool.query('SELECT * FROM cliente ORDER BY id');
  return result.rows;
};

const updateCliente = async (id, data) => {
  const { nombre, cuit } = data;
  const result = await pool.query(
    `
    UPDATE cliente
    SET
      nombre = COALESCE($1, nombre),
      cuit   = COALESCE($2, cuit),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $3
    RETURNING *
    `,
    [nombre, cuit, id]
  );
  return result.rows[0];
};

const deleteCliente = async (id) => {
  const result = await pool.query(
    'DELETE FROM cliente WHERE id = $1 RETURNING *',
    [id]
  );
  return result.rows[0];
};

// ... getClienteListService, updateClienteService, deleteClienteService

module.exports = {
  createCliente,
  getClienteById,
  getClienteList,
  updateCliente,
  deleteCliente,
};
