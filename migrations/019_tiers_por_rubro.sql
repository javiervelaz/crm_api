-- migrations/019_tiers_por_rubro.sql
--
-- Tiers por rubro: cada rubro decide qué incluye cada tier y cuánto cuesta.
-- Los tiers (FREE/BASIC/PREMIUM/CUSTOM) siguen siendo los mismos para todos;
-- lo que cambia por rubro es la oferta.
--
-- · rubro_tier: una fila por (rubro, tier) con precio, duración, si se puede
--   contratar y las features (jsonb, mismas claves que PLAN_FEATURES).
--   Gastronomía arranca EXACTAMENTE con lo de hoy (precio del tier y
--   PLAN_FEATURES), así ningún cliente actual ve un cambio.
--   Educación arranca con precio 0 y los tiers pagos NO disponibles hasta
--   cargar costos: un PREMIUM a $0 disponible sería un PREMIUM gratis.
-- · billing_subscription: snapshot de lo que se contrató (rubro, precio,
--   duración). El monto de un preapproval queda fijo hasta que termina; una
--   suscripción nueva toma el precio vigente.
-- · billing_pago: pagos únicos aprobados (CUSTOM anual, etc.), con snapshot y
--   unique por mp_payment_id → un reintento del webhook ya no extiende el plan
--   dos veces.
--
-- Para setear precios / disponibilidad / features:
--   UPDATE rubro_tier SET precio_mensual = 25000, disponible = true
--    WHERE rubro_codigo = 'educacion' AND tier_id = (SELECT id FROM tier WHERE code = 'PREMIUM');
--   UPDATE rubro_tier SET features = features || '{"canUseReports": true}'
--    WHERE rubro_codigo = 'educacion' AND tier_id = (SELECT id FROM tier WHERE code = 'PREMIUM');
--
-- Idempotente.

BEGIN;

CREATE TABLE IF NOT EXISTS rubro_tier (
  rubro_codigo    VARCHAR(30)   NOT NULL REFERENCES rubro (codigo),
  tier_id         INT           NOT NULL REFERENCES tier (id),
  precio_mensual  NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (precio_mensual >= 0),
  duracion_meses  INT           NOT NULL DEFAULT 1 CHECK (duracion_meses >= 1),
  disponible      BOOLEAN       NOT NULL DEFAULT FALSE,
  features        JSONB         NOT NULL DEFAULT '{}'::jsonb,
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  PRIMARY KEY (rubro_codigo, tier_id)
);

-- Features de hoy (services/cliente/planService.js → PLAN_FEATURES)
CREATE TEMP TABLE _features_hoy (code TEXT PRIMARY KEY, features JSONB) ON COMMIT DROP;
INSERT INTO _features_hoy VALUES
  ('FREE',    '{"canUseReports": false, "canUseWhatsappBot": false, "canUseBot": false, "canUsePedidosOnline": true, "maxPedidosMensuales": 50, "maxProductos": 5, "diasDeTrial": 14}'),
  ('BASIC',   '{"canUseReports": false, "canUseWhatsappBot": false, "canUseBot": false, "canUsePedidosOnline": true, "maxPedidosMensuales": null, "maxProductos": null}'),
  ('PREMIUM', '{"canUseReports": true,  "canUseWhatsappBot": true,  "canUseBot": true,  "canUsePedidosOnline": true, "maxPedidosMensuales": null, "maxProductos": null}'),
  ('CUSTOM',  '{"canUseReports": true,  "canUseWhatsappBot": true,  "canUseBot": true,  "canUsePedidosOnline": true, "maxPedidosMensuales": null, "maxProductos": null}');

-- Gastronomía: igual que hoy
INSERT INTO rubro_tier (rubro_codigo, tier_id, precio_mensual, duracion_meses, disponible, features)
SELECT 'gastronomia', t.id, COALESCE(t.precio_mensual, 0), GREATEST(COALESCE(t.duracion_meses, 1), 1),
       COALESCE(t.es_activo, false), COALESCE(f.features, '{}'::jsonb)
  FROM tier t
  LEFT JOIN _features_hoy f ON f.code = UPPER(t.code)
ON CONFLICT (rubro_codigo, tier_id) DO NOTHING;

-- Educación: precio 0 (a cargar), pagos no disponibles, sin micrositio de pedidos
INSERT INTO rubro_tier (rubro_codigo, tier_id, precio_mensual, duracion_meses, disponible, features)
SELECT 'educacion', t.id, 0, GREATEST(COALESCE(t.duracion_meses, 1), 1),
       (UPPER(t.code) = 'FREE' AND COALESCE(t.es_activo, false)),
       COALESCE(f.features, '{}'::jsonb)
         || '{"canUsePedidosOnline": false, "canUseWhatsappBot": false, "maxPedidosMensuales": null, "maxProductos": null}'::jsonb
  FROM tier t
  LEFT JOIN _features_hoy f ON f.code = UPPER(t.code)
 WHERE EXISTS (SELECT 1 FROM rubro WHERE codigo = 'educacion')
ON CONFLICT (rubro_codigo, tier_id) DO NOTHING;

-- Snapshot en suscripciones
ALTER TABLE billing_subscription ADD COLUMN IF NOT EXISTS rubro_codigo   VARCHAR(30);
ALTER TABLE billing_subscription ADD COLUMN IF NOT EXISTS precio_mensual NUMERIC(12,2);
ALTER TABLE billing_subscription ADD COLUMN IF NOT EXISTS duracion_meses INT;

-- Pagos únicos aprobados
CREATE TABLE IF NOT EXISTS billing_pago (
  id              SERIAL PRIMARY KEY,
  cliente_id      INT           NOT NULL REFERENCES cliente (id) ON DELETE CASCADE,
  tier_id         INT           NOT NULL REFERENCES tier (id),
  rubro_codigo    VARCHAR(30),
  mp_payment_id   VARCHAR(100)  NOT NULL UNIQUE,
  monto           NUMERIC(12,2) NOT NULL,
  duracion_meses  INT           NOT NULL,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS billing_pago_cliente_idx ON billing_pago (cliente_id);

COMMIT;
