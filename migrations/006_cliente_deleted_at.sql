-- migrations/006_cliente_deleted_at.sql
--
-- cliente.deleted_at tiene DEFAULT CURRENT_TIMESTAMP. Es la unica columna
-- deleted_at de la base con default, y hace que TODO cliente nazca
-- soft-borrado.
--
-- Consecuencia concreta: el indice uq_cliente_cuit que agrego 003_signup.sql
--
--   CREATE UNIQUE INDEX uq_cliente_cuit ON cliente (cuit) WHERE deleted_at IS NULL
--
-- no matchea ninguna fila jamas. El unico que protege el CUIT hoy es el
-- constraint viejo cliente_cuit_key.
--
-- Hoy no explota porque ninguna query del repo lee deleted_at (grep: cero
-- resultados). Es una mina: el dia que alguien agregue "WHERE deleted_at IS
-- NULL" sobre cliente -- lo mas natural del mundo -- le devuelve cero filas.
BEGIN;

ALTER TABLE cliente ALTER COLUMN deleted_at DROP DEFAULT;

-- Ninguna fila fue borrada de verdad: el valor que tienen es el timestamp de
-- creacion que puso el default.
UPDATE cliente SET deleted_at = NULL WHERE deleted_at IS NOT NULL;

COMMIT;
