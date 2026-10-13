-- migrations/011_roles_educacion.sql
--
-- Counter v2 — Etapa 3: usuarios externos del rubro educación.
--
-- · user_type PROF / TUT / ALU (profesor, tutor, alumno). Son usuarios
--   EXTERNOS al staff del tenant: entran al sistema pero sólo ven lo suyo
--   (middleware/cuentaGuards.js). Se asignan sólo al rubro educación vía
--   rubro_user_type, así no aparecen en las pizzerías.
-- · profile.debe_cambiar_password: la cuenta se entrega con contraseña
--   temporal y el primer login obliga a cambiarla.
-- · Backfill: los tenants de educación ya creados reciben sus roles nuevos
--   (el alta crea un rol por user_type del rubro; los existentes no los tenían).
--
-- Idempotente.

BEGIN;

-- user_type no tiene UNIQUE en codigo: se inserta sólo si falta.
INSERT INTO user_type (descripcion, codigo)
SELECT v.descripcion, v.codigo
  FROM (VALUES (1, 'profesor', 'PROF'), (2, 'tutor', 'TUT'), (3, 'alumno', 'ALU')) AS v(ord, descripcion, codigo)
 WHERE NOT EXISTS (SELECT 1 FROM user_type ut WHERE ut.codigo = v.codigo)
 ORDER BY v.ord;

INSERT INTO rubro_user_type (rubro_codigo, user_type_id)
SELECT 'educacion', ut.id
  FROM user_type ut
 WHERE ut.codigo IN ('PROF', 'TUT', 'ALU')
ON CONFLICT DO NOTHING;

-- rol.user_type_id lo crea la 012; se agrega acá también para que el orden en
-- que se corran las dos no deje roles sin tipo (bug CP-07).
ALTER TABLE rol ADD COLUMN IF NOT EXISTS user_type_id INTEGER REFERENCES user_type(id);

-- Roles faltantes en tenants de educación existentes (sin módulos ni
-- permisos: los del rubro llegan con el módulo de alumnos).
INSERT INTO rol (descripcion, cliente_id, user_type_id)
SELECT ut.descripcion, c.id, ut.id
  FROM cliente c
  JOIN rubro_user_type rut ON rut.rubro_codigo = c.rubro_codigo
  JOIN user_type ut        ON ut.id = rut.user_type_id
 WHERE c.rubro_codigo = 'educacion'
   AND ut.codigo IN ('PROF', 'TUT', 'ALU')
   AND NOT EXISTS (
         SELECT 1 FROM rol r
          WHERE r.cliente_id = c.id AND lower(r.descripcion) = lower(ut.descripcion)
       )
 ORDER BY c.id, ut.id;

UPDATE rol r
   SET user_type_id = ut.id
  FROM user_type ut
 WHERE r.user_type_id IS NULL
   AND ut.codigo IN ('PROF', 'TUT', 'ALU')
   AND lower(trim(r.descripcion)) = lower(ut.descripcion);

ALTER TABLE profile
  ADD COLUMN IF NOT EXISTS debe_cambiar_password BOOLEAN NOT NULL DEFAULT false;

COMMIT;
