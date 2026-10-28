-- migrations/024_salida_caja_medio_pago.sql
--
-- Medio de pago de cada salida de caja (gasto). Hasta ahora todo gasto se
-- asumía pagado en efectivo, y el cierre de caja descuenta los gastos del
-- efectivo esperado. Un comercio que paga sueldos, alquiler o proveedores por
-- transferencia veía un faltante falso en la diferencia de caja.
--
-- Reusa medio_pago (EFE, DEB, CRED, TRANS), el mismo catálogo de los pedidos.
-- Las filas existentes quedan como efectivo: es lo que se asumía hasta hoy, así
-- que ningún total histórico cambia. Un front viejo que no manda el campo sigue
-- funcionando: el default es efectivo.
--
-- Idempotente. Correr en cada base antes de desplegar la API que lo usa.

BEGIN;

DO $$
DECLARE
  efe_id INT;
BEGIN
  SELECT id INTO efe_id FROM medio_pago WHERE codigo = 'EFE';
  IF efe_id IS NULL THEN
    RAISE EXCEPTION 'medio_pago sin código EFE: no se puede fijar el default de salida_caja.medio_pago_id';
  END IF;

  ALTER TABLE salida_caja ADD COLUMN IF NOT EXISTS medio_pago_id INT REFERENCES medio_pago (id);

  UPDATE salida_caja SET medio_pago_id = efe_id WHERE medio_pago_id IS NULL;

  EXECUTE format('ALTER TABLE salida_caja ALTER COLUMN medio_pago_id SET DEFAULT %s', efe_id);
  ALTER TABLE salida_caja ALTER COLUMN medio_pago_id SET NOT NULL;
END $$;

COMMENT ON COLUMN salida_caja.medio_pago_id IS
  'Cómo se pagó el gasto (medio_pago). Sólo los gastos en efectivo salen del cajón en el cierre de caja.';

COMMIT;
