-- migrations/005_cliente_estado.sql
-- Activacion de cuenta por email. La columna cliente.estado ya existia con
-- DEFAULT 'ACTIVO' y ninguna linea de codigo la leia ni la escribia.
BEGIN;

-- Acotamos los valores ANTES de empezar a depender de la columna.
ALTER TABLE cliente DROP CONSTRAINT IF EXISTS chk_cliente_estado;
ALTER TABLE cliente ADD CONSTRAINT chk_cliente_estado
  CHECK (estado IN ('PENDIENTE_VERIFICACION','ACTIVO','SUSPENDIDO','BLOQUEADO'));

-- CRITICO: los clientes que ya existen quedan ACTIVO. Sin esto, el deploy
-- del gate deja a todos los tenants actuales afuera de su propia cuenta.
UPDATE cliente
   SET estado = 'ACTIVO'
 WHERE estado IS NULL OR estado = '' OR estado NOT IN
       ('PENDIENTE_VERIFICACION','ACTIVO','SUSPENDIDO','BLOQUEADO');

-- El default sigue siendo 'ACTIVO' a proposito: el alta por landing setea
-- 'PENDIENTE_VERIFICACION' explicitamente, y cualquier alta interna (soporte,
-- migracion, seed) nace usable sin tener que acordarse de la columna.

-- Para el cron de bloqueo: solo pendientes, ordenados por antiguedad.
CREATE INDEX IF NOT EXISTS idx_cliente_estado_pendiente
  ON cliente (created_at) WHERE estado = 'PENDIENTE_VERIFICACION';

-- Busqueda por email para el reenvio del link de verificacion.
CREATE INDEX IF NOT EXISTS idx_cliente_contacto_email_lower
  ON cliente (lower(contacto_email));

COMMIT;
