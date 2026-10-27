-- migrations/020_cliente_timezone.sql
--
-- Zona horaria por tenant. "Hoy", "este mes" y el día de cada pedido/gasto se
-- calculan en la zona del comercio (utils/fechaTenant.js), no en UTC.
-- Todos los clientes actuales son de Argentina → default Córdoba, sin cambios
-- visibles salvo que las cuentas de la noche (21:00–24:00) dejan de caer en el
-- día siguiente.
--
-- El CHECK valida contra la base de zonas de Postgres: una zona inválida falla
-- al insertar/actualizar en vez de romper cada consulta de fecha del tenant.
--
-- Para cambiar la zona de un comercio:
--   UPDATE cliente SET timezone = 'America/Mexico_City' WHERE id = <id>;
--
-- Idempotente.

BEGIN;

CREATE OR REPLACE FUNCTION es_timezone_valida(tz TEXT) RETURNS BOOLEAN
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = tz)
$$;

ALTER TABLE cliente
  ADD COLUMN IF NOT EXISTS timezone VARCHAR(64) NOT NULL DEFAULT 'America/Argentina/Cordoba';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cliente_timezone_valida') THEN
    ALTER TABLE cliente ADD CONSTRAINT cliente_timezone_valida CHECK (es_timezone_valida(timezone));
  END IF;
END $$;

COMMIT;
