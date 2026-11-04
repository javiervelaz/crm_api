-- migrations/029_senales_plan_onboarding.sql
--
-- Señales para el curador (ver CURADOR_GENERALIZACION_2026-11-04.md, casos 3 y 4).
-- Se empiezan a guardar ya, sin volumen todavía: cuando entren comercios, la
-- historia ya va a estar.
--
-- 1) plan_bloqueo: cada vez que un comercio choca contra su plan (403 de
--    requireFeature / requireLimit). Agregado por hora: una fila por
--    (comercio, hora, tipo, clave) con un contador, así un front que reintenta
--    en loop no infla la tabla. Lo escribe la API (pool.queryDirecta), fuera de
--    la transacción del request.
--
-- 2) onboarding_hito: la PRIMERA vez que un comercio hace cada cosa (registro,
--    primer producto, primer pedido, primera caja, primer cierre, primer gasto,
--    primer ítem de stock, bot conectado, primer usuario vinculado al bot,
--    primer empleado o profesor). Lo escriben triggers AFTER INSERT/UPDATE: cubre todos
--    los caminos (panel, micrositio, bot, scripts) sin tocar código de la API.
--    El trigger nunca rompe la operación de negocio: si falla, avisa y sigue.
--    El hito es inmutable (ON CONFLICT DO NOTHING): borrar el primer pedido no
--    corre la fecha.
--
-- Backfill de onboarding desde los timestamps existentes (UTC sin zona). El
-- primer producto no tiene fecha (producto no tiene created_at): queda con
-- at NULL = "antes de esta migración, fecha desconocida".
--
-- Idempotente.

BEGIN;

-- ─── 1) Bloqueos por plan ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS plan_bloqueo (
  cliente_id      INT          NOT NULL REFERENCES cliente (id) ON DELETE CASCADE,
  hora            TIMESTAMPTZ  NOT NULL,                   -- date_trunc('hour', now())
  tipo            VARCHAR(10)  NOT NULL CHECK (tipo IN ('feature', 'limite', 'vencido')),
  clave           VARCHAR(60)  NOT NULL,                   -- canUseReports, maxProductos…
  tier_code       VARCHAR(30),
  veces           INT          NOT NULL DEFAULT 1,
  ultima_ruta     VARCHAR(120),                            -- sin querystring
  ultimo_user_id  INT          REFERENCES "user" (id) ON DELETE SET NULL,
  ultima_vez      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  PRIMARY KEY (cliente_id, hora, tipo, clave)
);
CREATE INDEX IF NOT EXISTS plan_bloqueo_hora_idx ON plan_bloqueo (hora DESC);

COMMENT ON TABLE plan_bloqueo IS
  'Choques contra el plan (403 de requireFeature/requireLimit), agregados por hora. Señal comercial: qué empuja a pagar y qué límite está mal puesto.';

-- ─── 2) Hitos de onboarding ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS onboarding_hito (
  cliente_id  INT          NOT NULL REFERENCES cliente (id) ON DELETE CASCADE,
  hito        VARCHAR(30)  NOT NULL CHECK (hito IN (
                'registro', 'primer_producto', 'primer_pedido', 'primera_caja',
                'primer_cierre', 'primer_gasto', 'primer_stock', 'bot_conectado',
                'primer_vinculo_bot', 'primer_empleado')),
  at          TIMESTAMPTZ,                                 -- NULL = anterior a 029, fecha desconocida
  fuente      VARCHAR(10)  NOT NULL DEFAULT 'trigger' CHECK (fuente IN ('trigger', 'backfill')),
  PRIMARY KEY (cliente_id, hito)
);

COMMENT ON TABLE onboarding_hito IS
  'Primera vez que cada comercio hace cada cosa. Inmutable. Embudo de activación por rubro.';

CREATE OR REPLACE FUNCTION registrar_onboarding_hito() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_hito    text := TG_ARGV[0];
  v_cliente int;
BEGIN
  -- IF y no CASE: un CASE compila NEW.cliente_id aunque no lo use, y cliente no tiene esa columna.
  IF TG_TABLE_NAME = 'cliente' THEN
    v_cliente := NEW.id;
  ELSE
    v_cliente := NEW.cliente_id;
  END IF;
  IF v_cliente IS NULL THEN
    RETURN NULL;
  END IF;

  -- Primer empleado = primer usuario de staff que no es admin: empleado (EMP) o
  -- profesor (PROF). Tutores y alumnos de educación no cuentan: no son equipo.
  -- IF anidado: la condición sobre NEW.user_type_id sólo se evalúa en "user"
  -- (en una sola expresión con AND se compila igual y falla en las otras tablas).
  IF v_hito = 'primer_empleado' THEN
    IF NOT EXISTS (SELECT 1 FROM user_type ut
                    WHERE ut.id = NEW.user_type_id AND ut.codigo IN ('EMP', 'PROF')) THEN
      RETURN NULL;
    END IF;
  END IF;

  INSERT INTO onboarding_hito (cliente_id, hito, at, fuente)
  VALUES (v_cliente, v_hito, now(), 'trigger')
  ON CONFLICT (cliente_id, hito) DO NOTHING;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  -- La telemetría nunca rompe un alta, un pedido ni un cierre de caja.
  RAISE WARNING 'onboarding_hito (%, %): %', v_hito, v_cliente, SQLERRM;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS onb_registro          ON cliente;
DROP TRIGGER IF EXISTS onb_primer_producto   ON producto;
DROP TRIGGER IF EXISTS onb_primer_pedido     ON pedido;
DROP TRIGGER IF EXISTS onb_primera_caja      ON registro_diario;
DROP TRIGGER IF EXISTS onb_primer_cierre     ON registro_diario;
DROP TRIGGER IF EXISTS onb_primer_gasto      ON salida_caja;
DROP TRIGGER IF EXISTS onb_primer_stock      ON stock_item;
DROP TRIGGER IF EXISTS onb_bot_conectado     ON canal_cuenta;
DROP TRIGGER IF EXISTS onb_primer_vinculo    ON canal_usuario;
DROP TRIGGER IF EXISTS onb_primer_empleado   ON "user";

CREATE TRIGGER onb_registro        AFTER INSERT ON cliente         FOR EACH ROW EXECUTE FUNCTION registrar_onboarding_hito('registro');
CREATE TRIGGER onb_primer_producto AFTER INSERT ON producto        FOR EACH ROW EXECUTE FUNCTION registrar_onboarding_hito('primer_producto');
CREATE TRIGGER onb_primer_pedido   AFTER INSERT ON pedido          FOR EACH ROW EXECUTE FUNCTION registrar_onboarding_hito('primer_pedido');
CREATE TRIGGER onb_primera_caja    AFTER INSERT ON registro_diario FOR EACH ROW EXECUTE FUNCTION registrar_onboarding_hito('primera_caja');
CREATE TRIGGER onb_primer_cierre   AFTER UPDATE OF caja_cerrada ON registro_diario
  FOR EACH ROW WHEN (NEW.caja_cerrada IS TRUE AND OLD.caja_cerrada IS DISTINCT FROM TRUE)
  EXECUTE FUNCTION registrar_onboarding_hito('primer_cierre');
CREATE TRIGGER onb_primer_gasto    AFTER INSERT ON salida_caja     FOR EACH ROW EXECUTE FUNCTION registrar_onboarding_hito('primer_gasto');
CREATE TRIGGER onb_primer_stock    AFTER INSERT ON stock_item      FOR EACH ROW EXECUTE FUNCTION registrar_onboarding_hito('primer_stock');
CREATE TRIGGER onb_bot_conectado   AFTER INSERT ON canal_cuenta    FOR EACH ROW EXECUTE FUNCTION registrar_onboarding_hito('bot_conectado');
CREATE TRIGGER onb_primer_vinculo  AFTER INSERT ON canal_usuario   FOR EACH ROW EXECUTE FUNCTION registrar_onboarding_hito('primer_vinculo_bot');
CREATE TRIGGER onb_primer_empleado AFTER INSERT ON "user"          FOR EACH ROW EXECUTE FUNCTION registrar_onboarding_hito('primer_empleado');

-- ─── Backfill (timestamps sin zona = UTC) ─────────────────────────────────
INSERT INTO onboarding_hito (cliente_id, hito, at, fuente)
SELECT c.id, 'registro', c.created_at AT TIME ZONE 'UTC', 'backfill' FROM cliente c
ON CONFLICT DO NOTHING;

INSERT INTO onboarding_hito (cliente_id, hito, at, fuente)
SELECT DISTINCT p.cliente_id, 'primer_producto', NULL::timestamptz, 'backfill' FROM producto p
ON CONFLICT DO NOTHING;

INSERT INTO onboarding_hito (cliente_id, hito, at, fuente)
SELECT cliente_id, 'primer_pedido', min(created_at) AT TIME ZONE 'UTC', 'backfill' FROM pedido GROUP BY cliente_id
ON CONFLICT DO NOTHING;

INSERT INTO onboarding_hito (cliente_id, hito, at, fuente)
SELECT cliente_id, 'primera_caja', min(created_at) AT TIME ZONE 'UTC', 'backfill' FROM registro_diario GROUP BY cliente_id
ON CONFLICT DO NOTHING;

-- El cierre no tiene timestamp propio: updated_at de la primera caja cerrada.
INSERT INTO onboarding_hito (cliente_id, hito, at, fuente)
SELECT cliente_id, 'primer_cierre', min(updated_at) AT TIME ZONE 'UTC', 'backfill'
  FROM registro_diario WHERE caja_cerrada IS TRUE GROUP BY cliente_id
ON CONFLICT DO NOTHING;

INSERT INTO onboarding_hito (cliente_id, hito, at, fuente)
SELECT cliente_id, 'primer_gasto', min(created_at) AT TIME ZONE 'UTC', 'backfill' FROM salida_caja GROUP BY cliente_id
ON CONFLICT DO NOTHING;

INSERT INTO onboarding_hito (cliente_id, hito, at, fuente)
SELECT cliente_id, 'primer_stock', min(created_at) AT TIME ZONE 'UTC', 'backfill' FROM stock_item GROUP BY cliente_id
ON CONFLICT DO NOTHING;

INSERT INTO onboarding_hito (cliente_id, hito, at, fuente)
SELECT cliente_id, 'bot_conectado', min(created_at), 'backfill' FROM canal_cuenta GROUP BY cliente_id
ON CONFLICT DO NOTHING;

INSERT INTO onboarding_hito (cliente_id, hito, at, fuente)
SELECT cliente_id, 'primer_vinculo_bot', min(created_at), 'backfill' FROM canal_usuario GROUP BY cliente_id
ON CONFLICT DO NOTHING;

INSERT INTO onboarding_hito (cliente_id, hito, at, fuente)
SELECT u.cliente_id, 'primer_empleado', min(u.created_at) AT TIME ZONE 'UTC', 'backfill'
  FROM "user" u JOIN user_type ut ON ut.id = u.user_type_id
 WHERE ut.codigo IN ('EMP', 'PROF')
 GROUP BY u.cliente_id
ON CONFLICT DO NOTHING;

COMMIT;
