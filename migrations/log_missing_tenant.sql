-- Fase observación: permite todo, pero registra los accesos sin tenant
CREATE OR REPLACE FUNCTION log_missing_tenant() RETURNS boolean AS $$
BEGIN
  IF current_cliente_id() IS NULL THEN
    RAISE WARNING 'RLS: query sin app.cliente_id — backend_pid=%', pg_backend_pid();
  END IF;
  RETURN true;
END $$ LANGUAGE plpgsql STABLE;

CREATE POLICY tenant_audit ON producto USING (log_missing_tenant());