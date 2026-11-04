-- migrations/030_billing_webhook.sql
--
-- Fix del webhook de MercadoPago (ver claude/VERIFICACION_PAGOS_MP_2026-11-04.md).
--
-- 1) billing_webhook_log: cada evento firmado que llega (y cada pasada de la
--    reconciliación) queda registrado con lo que hizo Counter. Es la forma de
--    saber si los pagos funcionan sin tener que pagar y mirar.
--
-- 2) billing_subscription.activada_at: la activación por preapproval
--    'authorized' corre una sola vez aunque MP mande N eventos de update.
--    billing_subscription.mp_status: último estado visto en MP
--    (pending / authorized / paused / cancelled).
--
-- 3) billing_pago.origen + mp_preapproval_id: los cobros mensuales de una
--    suscripción (subscription_authorized_payment) se registran en la misma
--    tabla que los pagos únicos, idempotentes por el id real del pago de MP.
--
-- Correr ANTES de deployar la API.

BEGIN;

CREATE TABLE IF NOT EXISTS billing_webhook_log (
  id           BIGSERIAL    PRIMARY KEY,
  recibido_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  tipo         VARCHAR(60),
  data_id      VARCHAR(100),
  request_id   VARCHAR(100),
  mp_status    VARCHAR(40),
  resultado    VARCHAR(40)  NOT NULL,
  detalle      TEXT,
  cliente_id   INT          REFERENCES cliente (id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS billing_webhook_log_recibido_idx ON billing_webhook_log (recibido_at DESC);
CREATE INDEX IF NOT EXISTS billing_webhook_log_data_idx     ON billing_webhook_log (data_id);

ALTER TABLE billing_subscription ADD COLUMN IF NOT EXISTS mp_status   VARCHAR(20);
ALTER TABLE billing_subscription ADD COLUMN IF NOT EXISTS activada_at TIMESTAMPTZ;

-- Las que ya figuran activas (hoy solo la del modo mock) no se vuelven a activar.
UPDATE billing_subscription
   SET activada_at = COALESCE(updated_at, created_at, NOW())
 WHERE status = 'active' AND activada_at IS NULL;

ALTER TABLE billing_pago ADD COLUMN IF NOT EXISTS origen            VARCHAR(20) NOT NULL DEFAULT 'pago_unico';
ALTER TABLE billing_pago ADD COLUMN IF NOT EXISTS mp_preapproval_id VARCHAR(100);
CREATE INDEX IF NOT EXISTS billing_pago_preapproval_idx ON billing_pago (mp_preapproval_id);

COMMIT;
