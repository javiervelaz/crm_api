-- migrations/014_legajo_autonumerico.sql
--
-- Legajo autonumérico por tenant. Hasta ahora se cargaba a mano (y el alta y
-- las credenciales generaban "ADMIN-25", "PROF-123"). De ahora en más lo
-- asigna la API: 1, 2, 3… por comercio, sin repetir aunque dos admins
-- guarden a la vez (UPDATE … RETURNING sobre la fila del tenant).
--
-- Los legajos existentes no se tocan. El contador arranca después del mayor
-- legajo numérico que ya tenga cada comercio (los "ADMIN-25" no cuentan).
-- Los clientes de pedidos (legajo 0) tampoco.
--
-- Idempotente.

BEGIN;

CREATE TABLE IF NOT EXISTS legajo_secuencia (
  cliente_id INTEGER PRIMARY KEY REFERENCES cliente(id),
  ultimo     INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO legajo_secuencia (cliente_id, ultimo)
SELECT c.id,
       COALESCE(MAX(CASE WHEN trim(p.legajo) ~ '^[0-9]{1,9}$' THEN trim(p.legajo)::int END), 0)
  FROM cliente c
  LEFT JOIN profile p ON p.cliente_id = c.id
 GROUP BY c.id
ON CONFLICT (cliente_id) DO NOTHING;

COMMIT;
