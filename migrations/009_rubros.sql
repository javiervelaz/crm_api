-- migrations/009_rubros.sql
--
-- Counter v2 — rubros (multi-vertical).
--
-- Un rubro es una PLANTILLA de alta: define qué módulos del catálogo
-- (modulo_maestro) y qué tipos de usuario (user_type) se instancian para un
-- tenant nuevo. No reemplaza nada del esquema actual de módulos/roles/permisos:
-- lo filtra.
--
--   modulo_maestro ──< rubro_modulo_maestro >── rubro ──< cliente
--   user_type      ──< rubro_user_type      >── rubro
--
-- Los tenants existentes quedan en 'gastronomia' y no cambia nada para ellos:
-- la plantilla de gastronomía es exactamente el catálogo activo de hoy.
--
-- Idempotente: se puede correr dos veces sin efectos.
--
-- OJO: 008_purga_clientes_sin_actividad.sql mide actividad con tablas de
-- gastronomía (pedidos, caja, productos). NO re-correrla con tenants de otro
-- rubro cargados: los borraría. Para purgar usar scripts/purgeClientes.js,
-- que desde esta versión filtra rubro_codigo = 'gastronomia'.

BEGIN;

-- ─── Catálogo de rubros ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rubro (
  codigo     VARCHAR(30)  PRIMARY KEY CHECK (codigo ~ '^[a-z][a-z0-9_]*$'),
  nombre     VARCHAR(60)  NOT NULL,
  activo     BOOLEAN      NOT NULL DEFAULT true,
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO rubro (codigo, nombre) VALUES
  ('gastronomia', 'Gastronomía'),
  ('educacion',   'Educación')
ON CONFLICT (codigo) DO NOTHING;

-- ─── Plantilla de módulos por rubro ────────────────────────────────────────
-- config_default se copia a modulo.config en el alta del tenant: es el
-- "setup" del módulo para ese rubro (ej. día de vencimiento de cuotas).
CREATE TABLE IF NOT EXISTS rubro_modulo_maestro (
  rubro_codigo      VARCHAR(30) NOT NULL REFERENCES rubro (codigo),
  modulo_maestro_id INT         NOT NULL REFERENCES modulo_maestro (id),
  config_default    JSONB       NOT NULL DEFAULT '{}',
  PRIMARY KEY (rubro_codigo, modulo_maestro_id)
);

-- Gastronomía: todo el catálogo activo, que es lo que hoy recibe cada alta.
INSERT INTO rubro_modulo_maestro (rubro_codigo, modulo_maestro_id)
SELECT 'gastronomia', mm.id
  FROM modulo_maestro mm
 WHERE mm.status = true
ON CONFLICT DO NOTHING;

-- Educación: sólo los módulos que no dependen de pedidos/productos.
-- Fuera: productos, operaciones, cerrarcaja (caja de pedidos) y reportes
-- (sus reportes de ventas leen pedido). Los módulos propios del rubro
-- (alumnos, clases, cuotas) se agregan en las migraciones del módulo.
INSERT INTO rubro_modulo_maestro (rubro_codigo, modulo_maestro_id)
SELECT 'educacion', mm.id
  FROM modulo_maestro mm
 WHERE mm.status = true
   AND mm.codigo IN ('usuarios', 'roles', 'plan', 'gasto', 'flujo')
ON CONFLICT DO NOTHING;

-- ─── Plantilla de tipos de usuario por rubro ───────────────────────────────
-- En el alta se crea un rol por cada user_type del rubro. Sin este filtro,
-- los tipos propios de un rubro (profesor, tutor, alumno) aparecerían como
-- roles en todas las pizzerías.
CREATE TABLE IF NOT EXISTS rubro_user_type (
  rubro_codigo VARCHAR(30) NOT NULL REFERENCES rubro (codigo),
  user_type_id INT         NOT NULL REFERENCES user_type (id),
  PRIMARY KEY (rubro_codigo, user_type_id)
);

-- Gastronomía: todos los tipos actuales (ADMIN, EMP, PROV, CLI).
INSERT INTO rubro_user_type (rubro_codigo, user_type_id)
SELECT 'gastronomia', ut.id FROM user_type ut
ON CONFLICT DO NOTHING;

-- Educación: por ahora admin y empleado. Profesor, tutor y alumno llegan
-- con feat/roles-edu.
INSERT INTO rubro_user_type (rubro_codigo, user_type_id)
SELECT 'educacion', ut.id FROM user_type ut
 WHERE ut.codigo IN ('ADMIN', 'EMP')
ON CONFLICT DO NOTHING;

-- ─── Tenant → rubro ────────────────────────────────────────────────────────
ALTER TABLE cliente
  ADD COLUMN IF NOT EXISTS rubro_codigo VARCHAR(30) NOT NULL DEFAULT 'gastronomia';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cliente_rubro_codigo_fkey'
  ) THEN
    ALTER TABLE cliente
      ADD CONSTRAINT cliente_rubro_codigo_fkey
      FOREIGN KEY (rubro_codigo) REFERENCES rubro (codigo);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS cliente_rubro_codigo_idx ON cliente (rubro_codigo);

-- ─── Config por módulo instanciado ─────────────────────────────────────────
-- El setup del módulo para ESTE tenant. Arranca como copia del
-- config_default del rubro y lo puede ajustar Counter desde /api/platform.
ALTER TABLE modulo
  ADD COLUMN IF NOT EXISTS config JSONB NOT NULL DEFAULT '{}';

COMMIT;
