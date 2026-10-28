-- migrations/023_harness_estado.sql
--
-- Estado de conversación del harness interno: lo mínimo para entender un
-- seguimiento ("¿y ayer?", "¿y los gastos?"). Una fila por chat de un canal; se
-- pisa en cada consulta resuelta y vence a los pocos minutos (expira_at).
--
-- Vercel no comparte memoria entre invocaciones, por eso va a la base.
-- Aislamiento: sin RLS en prod, toda consulta filtra por cliente_id además del
-- chat. params guarda sólo lo necesario para repetir la consulta (texto
-- normalizado del turno anterior y producto), nunca resultados ni montos.
--
-- Idempotente.

BEGIN;

CREATE TABLE IF NOT EXISTS harness_estado (
  cliente_id       INT          NOT NULL REFERENCES cliente (id) ON DELETE CASCADE,
  canal_cuenta_id  INT          NOT NULL,
  chat_id          VARCHAR(100) NOT NULL,
  user_id          INT          REFERENCES "user" (id) ON DELETE CASCADE,
  intent           VARCHAR(60)  NOT NULL,
  params           JSONB        NOT NULL DEFAULT '{}'::jsonb,
  expira_at        TIMESTAMPTZ  NOT NULL,
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  PRIMARY KEY (cliente_id, canal_cuenta_id, chat_id)
);

CREATE INDEX IF NOT EXISTS harness_estado_expira_idx ON harness_estado (expira_at);

COMMIT;
