-- migrations/018_canal_usuario.sql
--
-- Identidad en los bots: cada chat de Telegram que habla con el bot como
-- "comercio" (avisos de pedidos y, más adelante, el harness interno) queda
-- vinculado a UN usuario de Counter. Reemplaza el link de avisos compartido
-- de la 017 (config.avisos_code / config.avisos_chat_ids), que era anónimo:
-- cualquiera con el link recibía los pedidos y no había a quién aplicarle
-- permisos.
--
-- · canal_usuario: (bot, chat) ↔ usuario. Un chat por usuario y bot.
-- · canal_vinculacion: códigos de un solo uso para /start v_<código>, vencen
--   a los 10 min. Se guarda el sha256, nunca el código.
--
-- Idempotente.

BEGIN;

CREATE TABLE IF NOT EXISTS canal_usuario (
  id               SERIAL PRIMARY KEY,
  cliente_id       INT         NOT NULL REFERENCES cliente (id) ON DELETE CASCADE,
  user_id          INT         NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  canal_cuenta_id  INT         NOT NULL REFERENCES canal_cuenta (id) ON DELETE CASCADE,
  chat_id          TEXT        NOT NULL,
  avisos           BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ultimo_uso_at    TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS canal_usuario_chat_uq    ON canal_usuario (canal_cuenta_id, chat_id);
CREATE UNIQUE INDEX IF NOT EXISTS canal_usuario_usuario_uq ON canal_usuario (canal_cuenta_id, user_id);
CREATE INDEX IF NOT EXISTS canal_usuario_cliente_idx ON canal_usuario (cliente_id);

CREATE TABLE IF NOT EXISTS canal_vinculacion (
  codigo_hash      TEXT        PRIMARY KEY,
  cliente_id       INT         NOT NULL REFERENCES cliente (id) ON DELETE CASCADE,
  user_id          INT         NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  canal_cuenta_id  INT         NOT NULL REFERENCES canal_cuenta (id) ON DELETE CASCADE,
  expira_at        TIMESTAMPTZ NOT NULL,
  usado_at         TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS canal_vinculacion_usuario_idx ON canal_vinculacion (canal_cuenta_id, user_id);

-- Fuera el esquema anónimo de la 017: esos chats se vuelven a vincular
-- desde "Mi Telegram" (cada uno con su usuario).
UPDATE canal_cuenta
   SET config = config - 'avisos_code' - 'avisos_chat_ids', updated_at = NOW()
 WHERE provider = 'telegram' AND (config ? 'avisos_code' OR config ? 'avisos_chat_ids');

COMMIT;
