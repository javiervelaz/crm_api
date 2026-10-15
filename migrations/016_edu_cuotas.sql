-- migrations/016_edu_cuotas.sql
--
-- Counter v2 — Etapa 6: cuotas y pagos del rubro educación.
--
-- · edu_cuota: una por inscripción y mes. Guarda el snapshot del precio, el
--   descuento por varios instrumentos y el importe a pagar (sin recargo: el
--   recargo depende de la fecha de pago y se calcula al aprobar).
-- · edu_pago: lo que paga el admin (entra aprobado) o sube el alumno/tutor con
--   comprobante (entra pendiente y lo aprueba o rechaza el admin).
-- · edu_pago_cuota: qué cuotas cubre cada pago, con el recargo aplicado.
-- · Config del módulo alumnos: descuento por escalones y tope.
--
-- Idempotente.

BEGIN;

CREATE TABLE IF NOT EXISTS edu_cuota (
  id              SERIAL PRIMARY KEY,
  cliente_id      INT            NOT NULL REFERENCES cliente (id),
  inscripcion_id  INT            NOT NULL REFERENCES edu_inscripcion (id),
  alumno_id       INT            NOT NULL REFERENCES edu_alumno (id),
  periodo         DATE           NOT NULL CHECK (EXTRACT(DAY FROM periodo) = 1),
  -- alta: mes de inscripción, proporcional a las clases que quedan
  tipo            VARCHAR(10)    NOT NULL DEFAULT 'mensual' CHECK (tipo IN ('mensual', 'alta')),
  importe_base    NUMERIC(12, 2) NOT NULL CHECK (importe_base >= 0),   -- snapshot del precio mensual
  clases_mes      SMALLINT       NOT NULL CHECK (clases_mes >= 0),
  clases_cobradas SMALLINT       NOT NULL CHECK (clases_cobradas >= 0),
  descuento_pct   NUMERIC(5, 2)  NOT NULL DEFAULT 0 CHECK (descuento_pct BETWEEN 0 AND 100),
  importe         NUMERIC(12, 2) NOT NULL CHECK (importe >= 0),        -- a pagar, sin recargo
  vence           DATE           NOT NULL,
  estado          VARCHAR(12)    NOT NULL DEFAULT 'pendiente'
                  CHECK (estado IN ('pendiente', 'en_revision', 'pagada')),
  created_at      TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (inscripcion_id, periodo)
);

CREATE TABLE IF NOT EXISTS edu_pago (
  id                  SERIAL PRIMARY KEY,
  cliente_id          INT          NOT NULL REFERENCES cliente (id),
  origen              VARCHAR(10)  NOT NULL CHECK (origen IN ('admin', 'portal')),
  estado              VARCHAR(10)  NOT NULL DEFAULT 'pendiente'
                      CHECK (estado IN ('pendiente', 'aprobado', 'rechazado')),
  pagador_user_id     INT          REFERENCES "user" (id),
  -- fecha informada por quien paga; al aprobar la confirma (o corrige) el admin
  fecha_pago          DATE,
  importe_total       NUMERIC(12, 2),            -- con recargos; se fija al aprobar
  medio_pago          VARCHAR(40),
  observacion         VARCHAR(300),
  -- subido después del vencimiento: el admin lo verifica con más atención
  fuera_de_termino    BOOLEAN      NOT NULL DEFAULT false,
  comprobante_provider VARCHAR(30),
  comprobante_key     VARCHAR(300),
  comprobante_meta    JSONB,
  comprobante_nombre  VARCHAR(200),
  comprobante_mime    VARCHAR(100),
  motivo_rechazo      VARCHAR(500),
  revisado_por        INT          REFERENCES "user" (id),
  revisado_at         TIMESTAMP,
  notificado_at       TIMESTAMP,
  created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT edu_pago_rechazo_con_motivo CHECK (estado <> 'rechazado' OR motivo_rechazo IS NOT NULL),
  CONSTRAINT edu_pago_portal_con_comprobante CHECK (origen <> 'portal' OR comprobante_key IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS edu_pago_cuota (
  id             SERIAL PRIMARY KEY,
  cliente_id     INT            NOT NULL REFERENCES cliente (id),
  pago_id        INT            NOT NULL REFERENCES edu_pago (id) ON DELETE CASCADE,
  cuota_id       INT            NOT NULL REFERENCES edu_cuota (id),
  importe        NUMERIC(12, 2) NOT NULL,         -- importe de la cuota
  recargo_pct    NUMERIC(5, 2),                   -- NULL hasta aprobar
  recargo_importe NUMERIC(12, 2),
  total          NUMERIC(12, 2),
  UNIQUE (pago_id, cuota_id)
);

CREATE INDEX IF NOT EXISTS edu_cuota_cliente_periodo_idx ON edu_cuota (cliente_id, periodo, estado);
CREATE INDEX IF NOT EXISTS edu_cuota_alumno_idx          ON edu_cuota (cliente_id, alumno_id, periodo);
CREATE INDEX IF NOT EXISTS edu_pago_cliente_estado_idx   ON edu_pago (cliente_id, estado, created_at DESC);
CREATE INDEX IF NOT EXISTS edu_pago_pagador_idx          ON edu_pago (cliente_id, pagador_user_id);
CREATE INDEX IF NOT EXISTS edu_pago_cuota_cuota_idx      ON edu_pago_cuota (cuota_id);

-- ─── Config: descuento por cantidad de instrumentos ───────────────────────
-- 2 instrumentos 25%, 3 o más 30%, con tope. Sólo pisa la config que todavía
-- tiene el descuento en 0 (la que dejó la migración 015).
UPDATE rubro_modulo_maestro rmm
   SET config_default = rmm.config_default || jsonb_build_object('descuento_multi_clase',
       '{"tipo":"porcentaje","escalones":[{"desde_instrumentos":2,"porcentaje":25},{"desde_instrumentos":3,"porcentaje":30}],"tope":30}'::jsonb)
  FROM modulo_maestro mm
 WHERE mm.id = rmm.modulo_maestro_id AND mm.codigo = 'alumnos'
   AND COALESCE((rmm.config_default -> 'descuento_multi_clase' ->> 'valor')::numeric, 0) = 0
   AND NOT (rmm.config_default -> 'descuento_multi_clase' ? 'escalones');

UPDATE modulo m
   SET config = m.config || jsonb_build_object('descuento_multi_clase',
       '{"tipo":"porcentaje","escalones":[{"desde_instrumentos":2,"porcentaje":25},{"desde_instrumentos":3,"porcentaje":30}],"tope":30}'::jsonb)
 WHERE m.codigo = 'alumnos' AND m.deleted_at IS NULL
   AND COALESCE((m.config -> 'descuento_multi_clase' ->> 'valor')::numeric, 0) = 0
   AND NOT (COALESCE(m.config, '{}'::jsonb) -> 'descuento_multi_clase' ? 'escalones');

COMMIT;
