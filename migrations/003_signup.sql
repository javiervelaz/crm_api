-- migrations/003_signup.sql
BEGIN;

-- Sin esto, dos registros simultáneos con el mismo CUIT crean dos comercios.
-- La validación en app no alcanza: hay ventana entre el SELECT y el INSERT.
CREATE UNIQUE INDEX IF NOT EXISTS uq_cliente_cuit
  ON cliente (cuit) WHERE deleted_at IS NULL;

-- El login resuelve por email sin cliente_id (model/users/db.js:77).
-- Mientras eso siga así, el email tiene que ser único global o el login
-- devuelve un usuario arbitrario cuando hay colisión.
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_email_lower
  ON "user" (lower(email)) WHERE deleted_at IS NULL;

-- Trazabilidad del alta y aceptación de términos (Ley 25.326)
ALTER TABLE cliente
  ADD COLUMN IF NOT EXISTS terminos_aceptados_at timestamptz,
  ADD COLUMN IF NOT EXISTS terminos_version      text,
  ADD COLUMN IF NOT EXISTS signup_ip             inet,
  ADD COLUMN IF NOT EXISTS email_verificado_at   timestamptz,
  ADD COLUMN IF NOT EXISTS utm_source            text,
  ADD COLUMN IF NOT EXISTS utm_campaign          text;

-- Verificación de email diferida: no bloquea el primer login,
-- pero te deja apagar cuentas basura sin borrar datos.
CREATE TABLE IF NOT EXISTS email_verification (
  token       text        PRIMARY KEY,
  cliente_id  integer     NOT NULL REFERENCES cliente(id) ON DELETE CASCADE,
  user_id     integer     NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  email       text        NOT NULL,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_verification_cliente
  ON email_verification (cliente_id) WHERE used_at IS NULL;

COMMIT;