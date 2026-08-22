-- migrations/007_cliente_estado_longitud.sql
--
-- cliente.estado es varchar(20) y 'PENDIENTE_VERIFICACION' mide 22.
-- El CHECK de 005 acepta el valor, pero la columna no lo puede guardar:
-- todo signup moría con 22001 "value too long for type character varying(20)".
--
-- Ampliar un varchar en Postgres es cambio de catálogo solamente: no reescribe
-- la tabla, no bloquea lecturas, es instantáneo aunque haya millones de filas.
BEGIN;

ALTER TABLE cliente ALTER COLUMN estado TYPE character varying(30);

-- El CHECK sobrevive al ALTER TYPE, pero lo recreamos para dejarlo explícito
-- y que quede claro que estos cuatro son los únicos valores válidos.
ALTER TABLE cliente DROP CONSTRAINT IF EXISTS chk_cliente_estado;
ALTER TABLE cliente ADD CONSTRAINT chk_cliente_estado
  CHECK (estado IN ('PENDIENTE_VERIFICACION','ACTIVO','SUSPENDIDO','BLOQUEADO'));

COMMIT;
