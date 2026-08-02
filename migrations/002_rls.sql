-- migrations/002_rls.sql
BEGIN;

-- El tenant del request viaja en una GUC de sesión
CREATE OR REPLACE FUNCTION current_cliente_id() RETURNS integer AS $$
  SELECT NULLIF(current_setting('app.cliente_id', true), '')::integer;
$$ LANGUAGE sql STABLE;

-- Aplicar a cada tabla tenant-scoped
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'cliente','usuario','producto','tipo_producto','pedido','salida_caja',
    'registro_diario','categoria_salida','rol','permiso','rol_permiso',
    'modulo_rol','user_rol','profile','empleado','sucursal',
    'compra_insumo','inventario_insumo','movimiento_inventario'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    -- FORCE es imprescindible en Neon: el rol dueño de las tablas
    -- bypassa RLS por defecto y la política no haría nada.
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I
        USING (cliente_id = current_cliente_id())
        WITH CHECK (cliente_id = current_cliente_id())
    $f$, t);
  END LOOP;
END $$;

COMMIT;