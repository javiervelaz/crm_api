-- migrations/021_salida_caja_fk_tipo.sql
--
-- salida_caja.categoria_salida_id NO apunta a categoria_salida: guarda el id de
-- categoria_tipo (1 FI fijo, 2 VAR variable, 3 SU sueldos). Así lo graba el front
-- (GastoWizard → CATEGORIA_POR_TIPO) y así lo leen los reportes y el resumen de
-- caja (JOIN categoria_tipo ct ON sc.categoria_salida_id = ct.id).
--
-- Verificado en prod el 27/10/2026: 100% de las filas matchean categoria_tipo,
-- 0 matchean categoria_salida, 0 huérfanas.
--
-- No se renombra la columna (la usan front, reportes y caja); se documenta y se
-- le pone la FK que faltaba, así un id inválido falla al insertar en vez de
-- desaparecer en silencio de los reportes (que hacen JOIN, no LEFT JOIN).
--
-- Idempotente.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'salida_caja_categoria_tipo_fk') THEN
    ALTER TABLE salida_caja
      ADD CONSTRAINT salida_caja_categoria_tipo_fk
      FOREIGN KEY (categoria_salida_id) REFERENCES categoria_tipo (id) NOT VALID;
  END IF;
END $$;

ALTER TABLE salida_caja VALIDATE CONSTRAINT salida_caja_categoria_tipo_fk;

COMMENT ON COLUMN salida_caja.categoria_salida_id IS
  'id de categoria_tipo (1 fijo, 2 variable, 3 sueldos). Nombre histórico: NO referencia categoria_salida.';

COMMIT;
