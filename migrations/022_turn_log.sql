-- migrations/022_turn_log.sql
--
-- Telemetría del harness: UNA fila por turno, siempre (invariante 9), incluidos
-- los que no tocaron un modelo — que son la mayoría y son el punto del harness.
-- Se llama turn_log y no ai_usage a propósito: una tabla "de IA" invita a no
-- escribir la fila cuando no hubo IA, y esa fila ausente es justo el falso
-- negativo del router que esta tabla existe para cazar.
--
-- · cliente_id desde la primera fila: cuánto cuesta cada comercio (COGS).
-- · user_id: en el harness interno, qué pregunta cada rol = qué módulo le falta.
-- · cache_write_tokens (B11): una escritura de caché cuesta 1,25x el input.
-- · msgs_out / msgs_billing (B13): los canales comerciales cobran por mensaje
--   saliente; lo llena el transporte, no el harness.
-- · gasto: lo marca el ejecutor a mano (invariante 11), no se infiere de tokens.
-- · texto: lo que escribió el usuario, recortado. Es lo que va a definir el
--   catálogo de intents real (el inicial salió de imaginar una PYME genérica).
--
-- Idempotente.

BEGIN;

CREATE TABLE IF NOT EXISTS turn_log (
  id                  BIGSERIAL    PRIMARY KEY,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  cliente_id          INT          NOT NULL REFERENCES cliente (id) ON DELETE CASCADE,
  user_id             INT          REFERENCES "user" (id) ON DELETE SET NULL,
  vertical            VARCHAR(20)  NOT NULL CHECK (vertical IN ('interno', 'atencion')),
  canal               VARCHAR(20)  NOT NULL,              -- telegram | whatsapp | panel | test
  canal_cuenta_id     INT,
  external_user_id    VARCHAR(100),                      -- chat_id / wa_id
  texto               VARCHAR(500),
  intent              VARCHAR(60),
  stage               VARCHAR(30)  NOT NULL,              -- comando | fijo | patron | producto | clasificador | fallback | permiso | error
  ok                  BOOLEAN      NOT NULL DEFAULT true,
  gasto               BOOLEAN      NOT NULL DEFAULT false,
  model               VARCHAR(60),                        -- NULL = el turno no tocó un modelo
  input_tokens        INT          NOT NULL DEFAULT 0,
  output_tokens       INT          NOT NULL DEFAULT 0,
  cached_tokens       INT          NOT NULL DEFAULT 0,
  cache_write_tokens  INT          NOT NULL DEFAULT 0,
  msgs_out            INT          NOT NULL DEFAULT 0,
  msgs_billing        VARCHAR(40),
  latency_ms          INT,
  error               VARCHAR(300)
);

CREATE INDEX IF NOT EXISTS turn_log_cliente_created_idx ON turn_log (cliente_id, created_at DESC);
CREATE INDEX IF NOT EXISTS turn_log_intent_idx ON turn_log (vertical, intent, created_at DESC);

COMMIT;
