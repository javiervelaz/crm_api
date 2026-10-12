-- migrations/010_gastos_sin_caja.sql
--
-- Gastos sin caja abierta.
--
-- Abrir caja es parte del módulo 'operaciones' (pedidos). Un tenant sin ese
-- módulo (ej. rubro educación) no tiene caja que abrir, pero sí gastos que
-- registrar. Para esos tenants salida_caja.registro_diario_id queda NULL y el
-- gasto se ubica en el tiempo por created_at.
--
-- La regla (exigir caja sólo si el tenant tiene 'operaciones' activo) vive en
-- services/salidaCaja/salidaCajaService.js. Gastronomía no cambia: para ellos
-- registro_diario_id sigue siendo obligatorio.
--
-- Idempotente.

BEGIN;

ALTER TABLE salida_caja ALTER COLUMN registro_diario_id DROP NOT NULL;

-- Listado de gastos por período (GET /api/salida-caja/periodo)
CREATE INDEX IF NOT EXISTS salida_caja_cliente_created_idx
  ON salida_caja (cliente_id, created_at);

COMMIT;
