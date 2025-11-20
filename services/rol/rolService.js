const e = require('express');
const db = require('../../model/roles/db');
const pool = require('../../pool');

const createRolService = async (rol) => {
    const { descripcion,cliente_id } = rol;
    // Validación de campos requeridos
    if (!descripcion ) {
      throw new Error('All fields are required');
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
      throw new Error('All fields are required');
    }
    
    const updatedRol = await db.updateRol(rolId, { descripcion,cliente_id});
    return updatedRol;
  }

  const deleteRolService = async (id,cliente_id) => {
    const result = await db.deleteRol(id,cliente_id);
    if (!result) {
      return res.status(404).json({ error: 'Rol not found' });
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
  const   postRolModulosPermisosService = async (rolId, clienteId, modulos) => {
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



  module.exports = {
    createRolService,
    getRolByIdService,
    getRolListService,
    updateRolService,
    deleteRolService,
    getRolModulosPermisosService,
    postRolModulosPermisosService,
};