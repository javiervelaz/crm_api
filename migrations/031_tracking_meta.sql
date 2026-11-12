-- migrations/031_tracking_meta.sql
--
-- Atribución de campañas (Meta/Instagram) y señal de activación.
--
-- utm_source y utm_campaign ya existían (alta desde la landing). Se suman:
--   utm_medium, utm_content (variante del anuncio), fbclid,
--   meta_fbp / meta_fbc (cookies del Pixel, para el match de la API de Conversiones),
--   meta_ua (user agent del alta),
--   meta_first_order_sent_at (dedupe del evento FirstOrder: se envía una sola vez).
--
-- Reglas: todo nullable y sin default; no toca filas existentes. Idempotente.
-- La fecha del primer pedido sale de onboarding_hito (migración 029), no se duplica acá.

ALTER TABLE cliente ADD COLUMN IF NOT EXISTS utm_medium  TEXT;
ALTER TABLE cliente ADD COLUMN IF NOT EXISTS utm_content TEXT;
ALTER TABLE cliente ADD COLUMN IF NOT EXISTS fbclid      TEXT;
ALTER TABLE cliente ADD COLUMN IF NOT EXISTS meta_fbp    TEXT;
ALTER TABLE cliente ADD COLUMN IF NOT EXISTS meta_fbc    TEXT;
ALTER TABLE cliente ADD COLUMN IF NOT EXISTS meta_ua     TEXT;
ALTER TABLE cliente ADD COLUMN IF NOT EXISTS meta_first_order_sent_at TIMESTAMPTZ;

-- Los comercios que ya existen no deben disparar FirstOrder retroactivo.
UPDATE cliente SET meta_first_order_sent_at = now() WHERE meta_first_order_sent_at IS NULL;

COMMENT ON COLUMN cliente.utm_content IS 'Variante del anuncio (utm_content) con que llegó el alta.';
COMMENT ON COLUMN cliente.meta_first_order_sent_at IS 'Cuándo se envió FirstOrder a Meta (CAPI). NULL = pendiente; se pisa a now() al enviar.';
