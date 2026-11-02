-- migrations/027_receta.sql
--
-- Inventario — Fase 2: recetas.
--
-- Una receta dice cuánto de cada ítem de stock consume UNA unidad de un
-- producto. Vender descuenta (cantidad + 0,5·mitad) × cantidad_por_unidad.
-- Un producto terminado (gaseosa) es una receta de una línea: 1 u del ítem.
--
-- · FKs compuestas por (id, cliente_id): una receta no puede mezclar un
--   producto de un comercio con un ítem de otro aunque el código se equivoque.
--   Para eso producto necesita UNIQUE (id, cliente_id) (id ya es PK: no cambia nada).
-- · Borrar un producto borra su receta. Un ítem de stock no se borra (baja lógica).
--
-- Idempotente.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'producto_id_cliente_uq') THEN
    ALTER TABLE producto ADD CONSTRAINT producto_id_cliente_uq UNIQUE (id, cliente_id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS receta (
  id                  SERIAL        PRIMARY KEY,
  cliente_id          INT           NOT NULL REFERENCES cliente (id),
  producto_id         INT           NOT NULL,
  stock_item_id       INT           NOT NULL,
  cantidad_por_unidad NUMERIC(14,4) NOT NULL CHECK (cantidad_por_unidad > 0),
  created_at          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT receta_producto_fk FOREIGN KEY (producto_id, cliente_id)
    REFERENCES producto (id, cliente_id) ON DELETE CASCADE,
  CONSTRAINT receta_item_fk FOREIGN KEY (stock_item_id, cliente_id)
    REFERENCES stock_item (id, cliente_id),
  CONSTRAINT receta_linea_uq UNIQUE (cliente_id, producto_id, stock_item_id)
);
CREATE INDEX IF NOT EXISTS receta_item_idx ON receta (cliente_id, stock_item_id);

COMMIT;
