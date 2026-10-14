const e = require('express');
const db = require('../../model/roles/db');
const pool = require('../../pool');
const tipoDb = require('../../model/users/tipo');

const errorCon = (message, status, code) => Object.assign(new Error(message), { status, code });

// Profesor, tutor y alumno son roles del sistema que maneja Academia: no se
// renombran, borran ni se les cambian permisos (y no se crea otro con su nombre,
// que lo volvería externo y a sus usuarios también).
const noExterno = async (rolId, cliente_id) => {
  if (await tipoDb.rolEsExterno(rolId, cliente_id)) {
    throw errorCon('Los roles de profesor, tutor y alumno son del sistema: se gestionan desde Academia', 400, 'ROL_EXTERNO');
  }
};

const createRolService = async (rol) => {
    const { descripcion,cliente_id } = rol;
    // Validación de campos requeridos
    if (!descripcion ) {
      throw new Error('All fields are required');
    }
    if (await tipoDb.nombreDeTipoExterno(descripcion)) {
      throw errorCon(`"${String(descripcion).trim()}" es un rol del sistema: elegí otro nombre`, 400, 'ROL_EXTERNO');
    }
    const newRol = await db.createRol({ descripcion,cliente_id });
    return newRol;
  }; 

  const getRolByIdService = async (id,cliente_id) => {
    const result = await db.getRolById(id,cliente_id);
    return result;
  }

  const getRolListService = async (cliente_id) => {
    const result = await db.getRols(cliente_id);
    return result.rows;
  }

  const updateRolService = async (rolId,rol) => {
    const { descripcion ,cliente_id} = rol;
    if (!descripcion  ) {
      throw errorCon('All fields are required', 400, 'FALTAN_DATOS');
    }
    await noExterno(rolId, cliente_id);
    if (await tipoDb.nombreDeTipoExterno(descripcion)) {
      throw errorCon(`"${String(descripcion).trim()}" es un rol del sistema: elegí otro nombre`, 400, 'ROL_EXTERNO');
    }
    const updatedRol = await db.updateRol(rolId, { descripcion,cliente_id});
    return updatedRol;
  }

  const deleteRolService = async (id,cliente_id) => {
    await noExterno(id, cliente_id);
    const result = await db.deleteRol(id,cliente_id);
    if (!result) {
      throw errorCon('Rol not found', 404, 'NOT_FOUND'); // antes: `res` inexistente → 500
    }
    return result;
  }


/**
 * Devuelve los módulos y permisos asignados a un rol.
 * Si querés además devolver todos los módulos del cliente para UI, eso lo deja el frontend (GET /api/modulo/:cliente_id)
 */
const getRolModulosPermisosService = async (rolId, clienteId) => {
  // 1) obtener módulos asignados al rol
  const modulosRes = await pool.query(
    `SELECT DISTINCT m.id AS modulo_id, m.codigo AS modulo_codigo, m.descripcion AS modulo_descripcion
     FROM modulo_rol mr
     JOIN modulo m ON mr.id_modulo = m.id
     WHERE mr.id_rol = $1 AND mr.cliente_id = $2`,
    [rolId, clienteId]
  );

  // 2) obtener permisos asignados a ese rol
  const permisosRes = await pool.query(
    `SELECT p.id AS permiso_id, p.codigo AS permiso_codigo, p.descripcion AS permiso_descripcion, p.modulo_id
     FROM rol_permiso rp
     JOIN permiso p ON rp.permiso_id = p.id
     WHERE rp.rol_id = $1 AND rp.cliente_id = $2`,
    [rolId, clienteId]
  );

  const modulos = modulosRes.rows;
  const permisos = permisosRes.rows;

  // Agrupar permisos por módulo
  const response = modulos.map((m) => {
    return {
      modulo_id: m.modulo_id,
      modulo_codigo: m.modulo_codigo,
      modulo_descripcion: m.modulo_descripcion,
      permisos: permisos
        .filter((p) => p.modulo_id === m.modulo_id)
        .map((p) => ({
          id: p.permiso_id,
          codigo: p.permiso_codigo,
          descripcion: p.permiso_descripcion,
        })),
    };
  });

  return response;
};

  /**
   * Sincroniza módulos y permisos para un rol.
   * Payload: [{ modulo_id, permisos: [permisoId,...] }, ...]
   * La función limpiará (DELETE) y volverá a insertar las relaciones para el rol dado.
   */
  const   postRolModulosPermisosService = async (rolId, clienteId, modulos, requestingUserId = null) => {
    await noExterno(rolId, clienteId);
    // Guard bug 15 (ROL-06): si el usuario que edita TIENE este rol, no puede
    // quitarse los módulos de administración (usuarios/roles) -> se autobloquea.
    if (requestingUserId) {
      const own = await pool.query(
        `SELECT 1 FROM user_rol WHERE id_user = $1 AND id_rol = $2 AND cliente_id = $3 LIMIT 1`,
        [requestingUserId, rolId, clienteId]
      );
      if (own.rowCount > 0) {
        const crit = await pool.query(
          `SELECT id, codigo FROM modulo WHERE codigo IN ('usuarios', 'roles')`
        );
        const payloadModuloIds = new Set((modulos || []).map((m) => Number(m.modulo_id)));
        // La tabla modulo puede tener varias filas por codigo: agrupamos por
        // codigo y exigimos que quede AL MENOS UNA de sus ids en el payload.
        const idsPorCodigo = {};
        for (const row of crit.rows) {
          (idsPorCodigo[row.codigo] = idsPorCodigo[row.codigo] || []).push(Number(row.id));
        }
        const faltantes = Object.keys(idsPorCodigo).filter(
          (codigo) => !idsPorCodigo[codigo].some((mid) => payloadModuloIds.has(mid))
        );
        if (faltantes.length) {
          const err = new Error(
            `No podés quitarte el acceso de administración (${faltantes.join(', ')}): quedarías sin poder gestionar usuarios ni roles.`
          );
          err.status = 400;
          err.code = 'SELF_LOCKOUT';
          throw err;
        }
      }
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1) Eliminar asociaciones previas del rol
      await client.query(
        `DELETE FROM rol_permiso WHERE rol_id = $1 AND cliente_id = $2`,
        [rolId, clienteId]
      );

      await client.query(
        `DELETE FROM modulo_rol WHERE id_rol = $1 AND cliente_id = $2`,
        [rolId, clienteId]
      );

      // 2) Insertar nuevas asociaciones
      for (const item of modulos) {
        const moduloId = item.modulo_id;
        const permisos = Array.isArray(item.permisos) ? item.permisos : [];

        if (moduloId) {
          await client.query(
            `INSERT INTO modulo_rol (id_modulo, id_rol, cliente_id)
            VALUES ($1, $2, $3)
            ON CONFLICT DO NOTHING`,
            [moduloId, rolId, clienteId]
          );
        }

        for (const permisoId of permisos) {
          await client.query(
            `INSERT INTO rol_permiso (rol_id, permiso_id, cliente_id)
            VALUES ($1, $2, $3)
            ON CONFLICT DO NOTHING`,
            [rolId, permisoId, clienteId]
          );
        }
      }

      await client.query('COMMIT');
      return { ok: true };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  };



  const countUsersWithRoleService = async (id, cliente_id) => {
    return await db.countUsersWithRole(id, cliente_id);
  };

  module.exports = {
    createRolService,
    getRolByIdService,
    getRolListService,
    updateRolService,
    deleteRolService,
    getRolModulosPermisosService,
    postRolModulosPermisosService,
    countUsersWithRoleService,
};