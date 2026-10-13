-- migrations/015_edu_catalogo.sql
--
-- Counter v2 — Etapa 4: catálogo del rubro educación.
-- Lo que la academia carga una vez y ajusta poco: tipos de clase, clases,
-- precios por mes, profesores, tutores, alumnos, inscripciones y horarios.
--
-- · Módulo `alumnos` en el catálogo y en la plantilla del rubro educación,
--   con la config de cuotas que usa la etapa 6 (vencimiento y recargos).
-- · Backfill de las academias existentes: módulo, acceso del rol admin,
--   permisos alumnos.list/create/update/delete y tipos de clase.
-- · Tablas edu_*: todas llevan cliente_id y se consultan siempre filtrando
--   por él. La relación con "user" es opcional (persona con o sin acceso).
--
-- Idempotente.

BEGIN;

-- ─── Módulo ───────────────────────────────────────────────────────────────
INSERT INTO modulo_maestro (codigo, descripcion, status)
SELECT 'alumnos', 'Gestion de alumnos y clases', true
 WHERE NOT EXISTS (SELECT 1 FROM modulo_maestro WHERE codigo = 'alumnos');

INSERT INTO rubro_modulo_maestro (rubro_codigo, modulo_maestro_id, config_default)
SELECT 'educacion', mm.id, '{
  "dia_vencimiento": 10,
  "recargos": [
    { "desde_dia": 11, "porcentaje": 15 },
    { "desde_dia": 21, "porcentaje": 25 }
  ],
  "descuento_multi_clase": { "tipo": "porcentaje", "valor": 0 }
}'::jsonb
  FROM modulo_maestro mm
 WHERE mm.codigo = 'alumnos'
ON CONFLICT DO NOTHING;

-- ─── Tablas ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS edu_tipo_clase (
  id         SERIAL PRIMARY KEY,
  cliente_id INT          NOT NULL REFERENCES cliente (id),
  nombre     VARCHAR(60)  NOT NULL,
  -- grupal: varios alumnos comparten profesor y horario (taller)
  es_grupal  BOOLEAN      NOT NULL DEFAULT false,
  activo     BOOLEAN      NOT NULL DEFAULT true,
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (cliente_id, nombre)
);

CREATE TABLE IF NOT EXISTS edu_profesor (
  id         SERIAL PRIMARY KEY,
  cliente_id INT          NOT NULL REFERENCES cliente (id),
  user_id    INT          UNIQUE REFERENCES "user" (id),
  nombre     VARCHAR(80)  NOT NULL,
  apellido   VARCHAR(80)  NOT NULL,
  telefono   VARCHAR(30),
  email      VARCHAR(150),
  activo     BOOLEAN      NOT NULL DEFAULT true,
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Tutor: responsable de alumnos menores (puede tener varios).
CREATE TABLE IF NOT EXISTS edu_tutor (
  id         SERIAL PRIMARY KEY,
  cliente_id INT          NOT NULL REFERENCES cliente (id),
  user_id    INT          UNIQUE REFERENCES "user" (id),
  nombre     VARCHAR(80)  NOT NULL,
  apellido   VARCHAR(80)  NOT NULL,
  telefono   VARCHAR(30)  NOT NULL,
  email      VARCHAR(150),
  activo     BOOLEAN      NOT NULL DEFAULT true,
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Alumno: el mayor puede tener acceso propio; el menor accede por su tutor
-- (la API exige tutor a los menores: depende de la fecha, no va en un CHECK).
CREATE TABLE IF NOT EXISTS edu_alumno (
  id               SERIAL PRIMARY KEY,
  cliente_id       INT          NOT NULL REFERENCES cliente (id),
  user_id          INT          UNIQUE REFERENCES "user" (id),
  tutor_id         INT          REFERENCES edu_tutor (id),
  nombre           VARCHAR(80)  NOT NULL,
  apellido         VARCHAR(80)  NOT NULL,
  telefono         VARCHAR(30),
  email            VARCHAR(150),
  fecha_nacimiento DATE         NOT NULL,
  activo           BOOLEAN      NOT NULL DEFAULT true,
  created_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT edu_alumno_un_solo_acceso CHECK (tutor_id IS NULL OR user_id IS NULL)
);

-- Clase = instrumento o materia ("Guitarra"). El horario vive en la inscripción.
CREATE TABLE IF NOT EXISTS edu_clase (
  id            SERIAL PRIMARY KEY,
  cliente_id    INT          NOT NULL REFERENCES cliente (id),
  tipo_clase_id INT          NOT NULL REFERENCES edu_tipo_clase (id),
  nombre        VARCHAR(80)  NOT NULL,
  -- sólo talleres: máximo de alumnos por horario (NULL = sin tope)
  cupo          INT          CHECK (cupo IS NULL OR cupo > 0),
  activa        BOOLEAN      NOT NULL DEFAULT true,
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (cliente_id, nombre, tipo_clase_id)
);

-- Precio vigente desde un mes; rige hasta que se carga uno posterior.
CREATE TABLE IF NOT EXISTS edu_clase_precio (
  id              SERIAL PRIMARY KEY,
  cliente_id      INT            NOT NULL REFERENCES cliente (id),
  clase_id        INT            NOT NULL REFERENCES edu_clase (id),
  vigente_desde   DATE           NOT NULL CHECK (EXTRACT(DAY FROM vigente_desde) = 1),
  importe_mensual NUMERIC(12, 2) NOT NULL CHECK (importe_mensual > 0),
  -- valor de la clase suelta (mes de alta, etapa 6)
  importe_clase   NUMERIC(12, 2) CHECK (importe_clase IS NULL OR importe_clase > 0),
  created_at      TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (clase_id, vigente_desde)
);

-- Inscripción = alumno + clase + profesor, por ciclo lectivo (año).
CREATE TABLE IF NOT EXISTS edu_inscripcion (
  id          SERIAL PRIMARY KEY,
  cliente_id  INT       NOT NULL REFERENCES cliente (id),
  alumno_id   INT       NOT NULL REFERENCES edu_alumno (id),
  clase_id    INT       NOT NULL REFERENCES edu_clase (id),
  profesor_id INT       NOT NULL REFERENCES edu_profesor (id),
  ciclo       SMALLINT  NOT NULL CHECK (ciclo BETWEEN 2000 AND 2100),
  fecha_alta  DATE      NOT NULL,
  fecha_baja  DATE,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT edu_inscripcion_fechas CHECK (fecha_baja IS NULL OR fecha_baja >= fecha_alta),
  UNIQUE (alumno_id, clase_id, ciclo)
);

-- Horario de cada inscripción: se arma al inscribir y se ajusta después.
-- dia_semana ISO: 1 = lunes … 7 = domingo.
CREATE TABLE IF NOT EXISTS edu_inscripcion_horario (
  id             SERIAL PRIMARY KEY,
  cliente_id     INT      NOT NULL REFERENCES cliente (id),
  inscripcion_id INT      NOT NULL REFERENCES edu_inscripcion (id) ON DELETE CASCADE,
  dia_semana     SMALLINT NOT NULL CHECK (dia_semana BETWEEN 1 AND 7),
  hora_inicio    TIME     NOT NULL,
  hora_fin       TIME     NOT NULL,
  CONSTRAINT edu_horario_rango CHECK (hora_fin > hora_inicio)
);

CREATE INDEX IF NOT EXISTS edu_tipo_clase_cliente_idx   ON edu_tipo_clase (cliente_id);
CREATE INDEX IF NOT EXISTS edu_profesor_cliente_idx     ON edu_profesor (cliente_id, activo);
CREATE INDEX IF NOT EXISTS edu_tutor_cliente_idx        ON edu_tutor (cliente_id, activo);
CREATE INDEX IF NOT EXISTS edu_alumno_cliente_idx       ON edu_alumno (cliente_id, activo);
CREATE INDEX IF NOT EXISTS edu_alumno_tutor_idx         ON edu_alumno (cliente_id, tutor_id);
CREATE INDEX IF NOT EXISTS edu_clase_cliente_idx        ON edu_clase (cliente_id, activa);
CREATE INDEX IF NOT EXISTS edu_clase_precio_idx         ON edu_clase_precio (clase_id, vigente_desde DESC);
CREATE INDEX IF NOT EXISTS edu_inscripcion_prof_idx     ON edu_inscripcion (cliente_id, profesor_id);
CREATE INDEX IF NOT EXISTS edu_inscripcion_alumno_idx   ON edu_inscripcion (cliente_id, alumno_id);
CREATE INDEX IF NOT EXISTS edu_inscripcion_clase_idx    ON edu_inscripcion (cliente_id, clase_id);
CREATE INDEX IF NOT EXISTS edu_horario_inscripcion_idx  ON edu_inscripcion_horario (inscripcion_id);
CREATE INDEX IF NOT EXISTS edu_horario_dia_idx          ON edu_inscripcion_horario (cliente_id, dia_semana);

-- ─── Backfill de academias existentes ─────────────────────────────────────
-- Módulo alumnos con la config del rubro
INSERT INTO modulo (codigo, descripcion, status, cliente_id, config)
SELECT mm.codigo, mm.descripcion, true, c.id, rmm.config_default
  FROM cliente c
  JOIN rubro_modulo_maestro rmm ON rmm.rubro_codigo = c.rubro_codigo
  JOIN modulo_maestro mm        ON mm.id = rmm.modulo_maestro_id AND mm.codigo = 'alumnos'
 WHERE NOT EXISTS (
         SELECT 1 FROM modulo m
          WHERE m.cliente_id = c.id AND m.codigo = 'alumnos' AND m.deleted_at IS NULL
       );

-- Acceso del rol admin al módulo
INSERT INTO modulo_rol (id_rol, id_modulo, cliente_id)
SELECT r.id, m.id, m.cliente_id
  FROM modulo m
  JOIN rol r ON r.cliente_id = m.cliente_id
  LEFT JOIN user_type ut ON ut.id = r.user_type_id
 WHERE m.codigo = 'alumnos' AND m.deleted_at IS NULL
   AND (ut.codigo = 'ADMIN' OR (r.user_type_id IS NULL AND lower(r.descripcion) = 'admin'))
   AND NOT EXISTS (
         SELECT 1 FROM modulo_rol mr WHERE mr.id_rol = r.id AND mr.id_modulo = m.id
       );

-- Permisos alumnos.list/create/update/delete
INSERT INTO permiso (descripcion, codigo, modulo_id, cliente_id, es_global)
SELECT pa.descripcion || ' - ' || m.descripcion, m.codigo || '.' || pa.codigo, m.id, m.cliente_id, false
  FROM modulo m
 CROSS JOIN permiso_accion pa
 WHERE m.codigo = 'alumnos' AND m.deleted_at IS NULL
   AND NOT EXISTS (
         SELECT 1 FROM permiso p
          WHERE p.cliente_id = m.cliente_id AND p.codigo = m.codigo || '.' || pa.codigo
       );

INSERT INTO rol_permiso (rol_id, permiso_id, cliente_id)
SELECT mr.id_rol, p.id, p.cliente_id
  FROM permiso p
  JOIN modulo m      ON m.id = p.modulo_id AND m.codigo = 'alumnos'
  JOIN modulo_rol mr ON mr.id_modulo = m.id
 WHERE NOT EXISTS (
         SELECT 1 FROM rol_permiso rp WHERE rp.rol_id = mr.id_rol AND rp.permiso_id = p.id
       );

-- Tipos de clase de las academias que ya existen
INSERT INTO edu_tipo_clase (cliente_id, nombre, es_grupal)
SELECT m.cliente_id, t.nombre, t.es_grupal
  FROM modulo m
 CROSS JOIN (VALUES ('Individual', false), ('Taller', true)) AS t(nombre, es_grupal)
 WHERE m.codigo = 'alumnos' AND m.deleted_at IS NULL
ON CONFLICT (cliente_id, nombre) DO NOTHING;

COMMIT;
