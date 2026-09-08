-- migrations/008_purga_clientes_sin_actividad.sql
--
-- Borra los clientes que nunca hicieron NADA: se registraron y no volvieron.
--
-- ═══════════════════════════════════════════════════════════════════════════
--  IRREVERSIBLE. Cree un branch en Neon antes de correr esto.
--  Recomendado: usar scripts/purgeClientes.js, que trae dry-run por default.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- CRITERIO (todo tiene que cumplirse):
--   · id <> 1                        el tenant semilla del sistema
--   · antigüedad >= 30 días
--   · 0 pedidos
--   · 0 registro_diario              nunca abrió la caja
--   · 0 salida_caja                  nunca registró un gasto
--   · 0 compra_insumo
--   · 0 producto                     nunca cargó el catálogo
--   · 0 whatsapp_bot_cliente         nunca conectó el bot
--   · sin billing_subscription en un estado distinto de pending/cancelled
--
-- OJO con tres tablas que tienen cliente_id pero NO tienen foreign key:
-- rol, conversations y whatsapp_bot_cliente. No cascadean ni bloquean: si no
-- se borran a mano quedan filas huérfanas apuntando a clientes inexistentes.
--
-- NO se toca ninguna tabla maestra: tier, user_type, medio_pago,
-- categoria_tipo, modulo_maestro, permiso_maestro, permiso_accion.

BEGIN;

-- ─── Candidatos ────────────────────────────────────────────────────────────
CREATE TEMP TABLE _purga_ids ON COMMIT DROP AS
SELECT c.id
  FROM cliente c
 WHERE c.id <> 1
   AND c.created_at < now() - interval '30 days'
   AND NOT EXISTS (SELECT 1 FROM pedido               t WHERE t.cliente_id = c.id)
   AND NOT EXISTS (SELECT 1 FROM registro_diario      t WHERE t.cliente_id = c.id)
   AND NOT EXISTS (SELECT 1 FROM salida_caja          t WHERE t.cliente_id = c.id)
   AND NOT EXISTS (SELECT 1 FROM compra_insumo        t WHERE t.cliente_id = c.id)
   AND NOT EXISTS (SELECT 1 FROM producto             t WHERE t.cliente_id = c.id)
   AND NOT EXISTS (SELECT 1 FROM whatsapp_bot_cliente t WHERE t.cliente_id = c.id)
   -- Nunca borrar a alguien que pagó. 'pending' es checkout abandonado, no
   -- protege; cualquier otro estado desconocido SÍ protege, a propósito.
   AND NOT EXISTS (
     SELECT 1 FROM billing_subscription b
      WHERE b.cliente_id = c.id
        AND b.status NOT IN ('pending', 'cancelled')
   );

-- Foto de lo que se va a borrar, para el log del deploy.
SELECT count(*) AS clientes_a_borrar FROM _purga_ids;

-- ─── Borrado, hijos primero ────────────────────────────────────────────────
-- El orden sale del grafo de FK: 57 constraints, sólo 5 cascadean.

-- Nietos
DELETE FROM pedido_producto WHERE pedido_id IN
  (SELECT id FROM pedido WHERE cliente_id IN (SELECT id FROM _purga_ids));
DELETE FROM conteo_caja WHERE registro_diario_id IN
  (SELECT id FROM registro_diario WHERE cliente_id IN (SELECT id FROM _purga_ids));
DELETE FROM movimiento_inventario WHERE inventario_insumos_id IN
  (SELECT id FROM inventario_insumos WHERE cliente_id IN (SELECT id FROM _purga_ids));
DELETE FROM movimiento_inventario WHERE registro_diario_id IN
  (SELECT id FROM registro_diario WHERE cliente_id IN (SELECT id FROM _purga_ids));
DELETE FROM producto_img WHERE producto_id IN
  (SELECT id FROM producto WHERE cliente_id IN (SELECT id FROM _purga_ids));
DELETE FROM whatsapp_message WHERE conversation_id IN
  (SELECT id FROM whatsapp_conversation WHERE cliente_id IN (SELECT id FROM _purga_ids));

-- Operaciones (todas referencian "user" y sucursal: van antes que ellos)
DELETE FROM compra_insumo   WHERE cliente_id IN (SELECT id FROM _purga_ids);
DELETE FROM salida_caja     WHERE cliente_id IN (SELECT id FROM _purga_ids);
DELETE FROM pedido          WHERE cliente_id IN (SELECT id FROM _purga_ids);
DELETE FROM registro_diario WHERE cliente_id IN (SELECT id FROM _purga_ids);

-- Catálogo e inventario
DELETE FROM inventario_insumos WHERE cliente_id IN (SELECT id FROM _purga_ids);
DELETE FROM producto           WHERE cliente_id IN (SELECT id FROM _purga_ids);
DELETE FROM tipo_producto      WHERE cliente_id IN (SELECT id FROM _purga_ids);
DELETE FROM categoria_salida   WHERE cliente_id IN (SELECT id FROM _purga_ids);

-- WhatsApp (whatsapp_bot_cliente y conversations NO tienen FK)
DELETE FROM whatsapp_conversation WHERE cliente_id IN (SELECT id FROM _purga_ids);
DELETE FROM whatsapp_bot_cliente  WHERE cliente_id IN (SELECT id FROM _purga_ids);
DELETE FROM conversations         WHERE cliente_id IN (SELECT id FROM _purga_ids);

-- Email
DELETE FROM email_outbox       WHERE cliente_id IN (SELECT id FROM _purga_ids);
DELETE FROM email_verification WHERE cliente_id IN (SELECT id FROM _purga_ids);

-- Auditoría
DELETE FROM logs WHERE cliente_id IN (SELECT id FROM _purga_ids);

-- Permisos y módulos (modulo_rol y rol_permiso antes que modulo y rol)
DELETE FROM user_rol    WHERE cliente_id IN (SELECT id FROM _purga_ids);
DELETE FROM rol_permiso WHERE cliente_id IN (SELECT id FROM _purga_ids);
DELETE FROM permiso     WHERE cliente_id IN (SELECT id FROM _purga_ids);
DELETE FROM modulo_rol  WHERE cliente_id IN (SELECT id FROM _purga_ids);
DELETE FROM modulo      WHERE cliente_id IN (SELECT id FROM _purga_ids);
-- rol no tiene FK. El IN ya excluye los cliente_id NULL, que son de sistema.
DELETE FROM rol         WHERE cliente_id IN (SELECT id FROM _purga_ids);

-- Usuarios (profile antes que "user")
DELETE FROM profile WHERE cliente_id IN (SELECT id FROM _purga_ids);
DELETE FROM "user"  WHERE cliente_id IN (SELECT id FROM _purga_ids);

-- Billing y estructura
DELETE FROM billing_subscription      WHERE cliente_id IN (SELECT id FROM _purga_ids);
DELETE FROM cliente_whatsapp_template WHERE cliente_id IN (SELECT id FROM _purga_ids);
DELETE FROM sucursal                  WHERE cliente_id IN (SELECT id FROM _purga_ids);

-- Y por fin el cliente
DELETE FROM cliente WHERE id IN (SELECT id FROM _purga_ids);

COMMIT;
