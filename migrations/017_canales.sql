-- migrations/017_canales.sql
--
-- Capa de canales para el micrositio de pedidos.
--
-- · canal_cuenta: una cuenta por comercio y canal. Hoy: 'link' (link público
--   del micrositio) y 'telegram' (bot propio del comercio). WhatsApp sigue en
--   whatsapp_bot_cliente (W0) hasta el alta con Embedded Signup (W2); su
--   provider lee esa tabla y queda apagado con CANAL_WHATSAPP_ENABLED.
-- · credenciales_enc: AES-256-GCM con CANAL_ENC_KEY (nunca texto plano).
-- · webhook_secret_hash: sha256 del secret_token que Telegram manda en cada
--   webhook. El secret en claro no se guarda.
-- · conversations: pasa a ser multi-canal (wa_phone_id deja de ser NOT NULL).
--
-- Idempotente.

BEGIN;

CREATE TABLE IF NOT EXISTS canal_cuenta (
  id                   SERIAL PRIMARY KEY,
  cliente_id           INT         NOT NULL REFERENCES cliente (id) ON DELETE CASCADE,
  provider             TEXT        NOT NULL CHECK (provider IN ('link', 'telegram', 'whatsapp')),
  external_id          TEXT        NOT NULL,          -- slug | id del bot | phone_number_id
  nombre               TEXT,                          -- slug | @username del bot | número visible
  credenciales_enc     TEXT,
  webhook_secret_hash  TEXT,
  status               TEXT        NOT NULL DEFAULT 'active'
                         CHECK (status IN ('active', 'suspended', 'disconnected')),
  config               JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Un bot / slug pertenece a un solo comercio (aunque esté desconectado: si
-- se vuelve a conectar, se reactiva la misma fila).
CREATE UNIQUE INDEX IF NOT EXISTS canal_cuenta_provider_external_uq
  ON canal_cuenta (provider, external_id);
-- Un link público por comercio.
CREATE UNIQUE INDEX IF NOT EXISTS canal_cuenta_link_por_cliente_uq
  ON canal_cuenta (cliente_id) WHERE provider = 'link';
CREATE INDEX IF NOT EXISTS canal_cuenta_cliente_idx ON canal_cuenta (cliente_id);

-- conversations multi-canal
ALTER TABLE conversations ALTER COLUMN wa_phone_id DROP NOT NULL;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'whatsapp';
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS canal_cuenta_id INT REFERENCES canal_cuenta (id) ON DELETE SET NULL;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS external_user_id TEXT;
CREATE INDEX IF NOT EXISTS conversations_canal_user_idx
  ON conversations (canal_cuenta_id, external_user_id);

COMMIT;
