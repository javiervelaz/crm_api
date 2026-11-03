-- migrations/028_plantilla_roles.sql
--
-- Permisos por defecto para los roles que no son admin.
--
-- Hasta ahora el alta sólo le daba módulos y permisos al rol admin: empleado,
-- proveedor y cliente nacían vacíos, y un empleado entraba a "No tenés acceso".
-- El dueño podía configurarlos en Roles, pero nadie lo hace.
--
-- · rubro_rol_plantilla: rubro × tipo de rol → módulo + acción. Mismo patrón
--   que rubro_modulo_maestro (009): la plantilla es dato, no código.
-- · aplicar_plantilla_roles(cliente): instancia la plantilla en los roles del
--   comercio que NO tienen ningún permiso. La usan el alta (clienteService) y
--   el backfill de abajo. Un rol que el dueño ya configuró no se toca, y
--   correrla dos veces no duplica nada.
-- · Sólo roles con user_type de la plantilla (EMP). Los roles creados a mano
--   (user_type NULL), proveedor, cliente y los externos de educación quedan
--   como están.
--
-- Empleado de gastronomía: toma pedidos, abre y cierra la caja, y carga
-- compras, mermas y conteos de stock. No borra pedidos, no ve reportes, gastos
-- ni flujo, y no administra usuarios, roles ni plan. Todo eso lo cambia el
-- dueño desde Roles.
--
-- Idempotente.

BEGIN;

CREATE TABLE IF NOT EXISTS rubro_rol_plantilla (
  rubro_codigo      VARCHAR(30)  NOT NULL REFERENCES rubro (codigo),
  user_type_id      INT          NOT NULL REFERENCES user_type (id),
  modulo_maestro_id INT          NOT NULL REFERENCES modulo_maestro (id),
  accion_codigo     VARCHAR(100) NOT NULL,   -- permiso_accion.codigo (list, create, update, delete)
  PRIMARY KEY (rubro_codigo, user_type_id, modulo_maestro_id, accion_codigo)
);

INSERT INTO rubro_rol_plantilla (rubro_codigo, user_type_id, modulo_maestro_id, accion_codigo)
SELECT v.rubro, ut.id, mm.id, v.accion
  FROM (VALUES
    ('gastronomia', 'EMP', 'operaciones', 'list'),
    ('gastronomia', 'EMP', 'operaciones', 'create'),
    ('gastronomia', 'EMP', 'operaciones', 'update'),
    ('gastronomia', 'EMP', 'cerrarcaja',  'list'),
    ('gastronomia', 'EMP', 'cerrarcaja',  'create'),
    ('gastronomia', 'EMP', 'inventario',  'list'),
    ('gastronomia', 'EMP', 'inventario',  'create'),
    ('educacion',   'EMP', 'alumnos',     'list'),
    ('educacion',   'EMP', 'alumnos',     'create'),
    ('educacion',   'EMP', 'alumnos',     'update')
  ) AS v(rubro, tipo, modulo, accion)
  JOIN user_type ut       ON ut.codigo = v.tipo
  JOIN modulo_maestro mm  ON mm.codigo = v.modulo
  -- sólo módulos que el rubro realmente tiene
  JOIN rubro_modulo_maestro rmm ON rmm.rubro_codigo = v.rubro AND rmm.modulo_maestro_id = mm.id
  JOIN permiso_accion pa  ON pa.codigo = v.accion
ON CONFLICT DO NOTHING;

-- Instancia la plantilla en los roles de un comercio que no tienen permisos.
-- Devuelve cuántos roles tocó.
CREATE OR REPLACE FUNCTION aplicar_plantilla_roles(p_cliente_id INT) RETURNS INT
LANGUAGE plpgsql AS $$
DECLARE
  v_roles INT[];
BEGIN
  SELECT array_agg(r.id) INTO v_roles
    FROM rol r
    JOIN cliente c ON c.id = r.cliente_id
   WHERE r.cliente_id = p_cliente_id
     AND EXISTS (SELECT 1 FROM rubro_rol_plantilla t
                  WHERE t.rubro_codigo = c.rubro_codigo AND t.user_type_id = r.user_type_id)
     AND NOT EXISTS (SELECT 1 FROM rol_permiso rp
                      WHERE rp.rol_id = r.id AND rp.cliente_id = r.cliente_id);

  IF v_roles IS NULL THEN
    RETURN 0;
  END IF;

  -- Permisos de los módulos de la plantilla que el comercio no tenga todavía
  -- (comercios anteriores a permiso_accion).
  INSERT INTO permiso (descripcion, codigo, modulo_id, cliente_id, es_global)
  SELECT DISTINCT pa.descripcion || ' - ' || m.descripcion, m.codigo || '.' || pa.codigo, m.id, m.cliente_id, false
    FROM rol r
    JOIN cliente c                ON c.id = r.cliente_id
    JOIN rubro_rol_plantilla t    ON t.rubro_codigo = c.rubro_codigo AND t.user_type_id = r.user_type_id
    JOIN modulo_maestro mm        ON mm.id = t.modulo_maestro_id
    JOIN modulo m                 ON m.cliente_id = r.cliente_id AND m.codigo = mm.codigo AND m.deleted_at IS NULL
    JOIN permiso_accion pa        ON pa.codigo = t.accion_codigo
   WHERE r.id = ANY (v_roles)
     AND NOT EXISTS (SELECT 1 FROM permiso p
                      WHERE p.cliente_id = m.cliente_id AND p.codigo = m.codigo || '.' || pa.codigo);

  INSERT INTO modulo_rol (id_rol, id_modulo, cliente_id)
  SELECT DISTINCT r.id, m.id, r.cliente_id
    FROM rol r
    JOIN cliente c                ON c.id = r.cliente_id
    JOIN rubro_rol_plantilla t    ON t.rubro_codigo = c.rubro_codigo AND t.user_type_id = r.user_type_id
    JOIN modulo_maestro mm        ON mm.id = t.modulo_maestro_id
    JOIN modulo m                 ON m.cliente_id = r.cliente_id AND m.codigo = mm.codigo AND m.deleted_at IS NULL
   WHERE r.id = ANY (v_roles)
     AND NOT EXISTS (SELECT 1 FROM modulo_rol mr WHERE mr.id_rol = r.id AND mr.id_modulo = m.id);

  INSERT INTO rol_permiso (rol_id, permiso_id, cliente_id)
  SELECT DISTINCT r.id, p.id, r.cliente_id
    FROM rol r
    JOIN cliente c                ON c.id = r.cliente_id
    JOIN rubro_rol_plantilla t    ON t.rubro_codigo = c.rubro_codigo AND t.user_type_id = r.user_type_id
    JOIN modulo_maestro mm        ON mm.id = t.modulo_maestro_id
    JOIN modulo m                 ON m.cliente_id = r.cliente_id AND m.codigo = mm.codigo AND m.deleted_at IS NULL
    JOIN permiso p                ON p.cliente_id = r.cliente_id AND p.codigo = m.codigo || '.' || t.accion_codigo
   WHERE r.id = ANY (v_roles)
     AND NOT EXISTS (SELECT 1 FROM rol_permiso rp WHERE rp.rol_id = r.id AND rp.permiso_id = p.id);

  RETURN array_length(v_roles, 1);
END $$;

-- ─── Backfill: comercios existentes ───────────────────────────────────────
SELECT c.id, aplicar_plantilla_roles(c.id) AS roles
  FROM cliente c
 ORDER BY c.id;

COMMIT;
