-- migrations/026_stock_item_sin_sucursal.sql
--
-- stock_item.sucursal_id pasa a opcional. El signup no crea sucursales y el
-- JWT siempre trae sucursal = 1 (services/auth/tokenService.js), así que
-- exigirla hacía que todos los ítems apuntaran a la sucursal del tenant 1.
-- Hasta que exista multi-sucursal real, el ítem es del comercio.
-- El nombre pasa a ser único por comercio.
--
-- Idempotente.

BEGIN;

ALTER TABLE stock_item ALTER COLUMN sucursal_id DROP NOT NULL;

DROP INDEX IF EXISTS stock_item_nombre_uq;
CREATE UNIQUE INDEX IF NOT EXISTS stock_item_nombre_uq
  ON stock_item (cliente_id, lower(nombre));

COMMIT;
