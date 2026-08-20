-- migrations/004_email_outbox.sql
-- Cola transaccional de emails salientes.
BEGIN;

CREATE TABLE IF NOT EXISTS email_outbox (
  id                  bigserial   PRIMARY KEY,
  cliente_id          integer     REFERENCES cliente(id) ON DELETE SET NULL,
  template            text        NOT NULL,
  to_email            text        NOT NULL,
  to_name             text,
  from_email          text        NOT NULL,
  from_name           text        NOT NULL,
  reply_to            text,
  payload             jsonb       NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key     text        UNIQUE,
  status              text        NOT NULL DEFAULT 'pending'
                                  CHECK (status IN ('pending','sending','sent','failed','cancelled')),
  attempts            smallint    NOT NULL DEFAULT 0,
  max_attempts        smallint    NOT NULL DEFAULT 5,
  scheduled_at        timestamptz NOT NULL DEFAULT now(),
  locked_at           timestamptz,
  sent_at             timestamptz,
  provider            text,
  provider_message_id text,
  last_error          text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Indice parcial: el worker solo mira pendientes. Sin el WHERE, el indice
-- crece con cada mail enviado para siempre.
CREATE INDEX IF NOT EXISTS idx_email_outbox_claim
  ON email_outbox (scheduled_at) WHERE status IN ('pending','sending');

CREATE INDEX IF NOT EXISTS idx_email_outbox_cliente
  ON email_outbox (cliente_id, created_at DESC);

-- OJO: esta tabla queda FUERA de RLS a proposito. El worker corre sin
-- app.cliente_id seteado; con RLS forzado no veria ninguna fila y la cola
-- nunca se drenaria. El aislamiento se garantiza en la capa de aplicacion:
-- ninguna ruta de tenant expone email_outbox.

COMMIT;
