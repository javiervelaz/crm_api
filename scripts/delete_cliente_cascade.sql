-- delete_cliente_cascade.sql
-- Borra un cliente (tenant) y TODO lo que cuelga de él, recorriendo las FKs
-- desde pg_constraint (soporta FKs multi-columna y cadenas de cualquier profundidad).
-- No depende de ON DELETE CASCADE ni de nombres de tablas hardcodeados.
--
-- Uso (dry-run primero, siempre dentro de transacción):
--   BEGIN;
--   SELECT * FROM delete_cliente_cascade('123');
--   ROLLBACK;   -- dry-run: solo mirás los conteos
--   -- COMMIT;  -- cuando los números cierren
--
-- Supuestos: tabla raíz public.cliente con PK "id".

CREATE OR REPLACE FUNCTION _del_cascade_rec(p_rel regclass, p_cond text, p_path oid[])
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  fk record;
  n bigint;
BEGIN
  FOR fk IN
    SELECT
      c.conrelid AS child_oid,
      c.conrelid::regclass AS child,
      (SELECT string_agg(format('%I', a.attname), ', ' ORDER BY k.ord)
         FROM unnest(c.conkey) WITH ORDINALITY k(attnum, ord)
         JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum) AS child_cols,
      (SELECT string_agg(format('%I', a.attname), ', ' ORDER BY k.ord)
         FROM unnest(c.confkey) WITH ORDINALITY k(attnum, ord)
         JOIN pg_attribute a ON a.attrelid = c.confrelid AND a.attnum = k.attnum) AS parent_cols
    FROM pg_constraint c
    WHERE c.contype = 'f'
      AND c.confrelid = p_rel
      AND c.conrelid <> p_rel              -- autorreferencias: se resuelven en el mismo DELETE
      AND NOT (c.conrelid = ANY (p_path))  -- corte de ciclos
  LOOP
    PERFORM _del_cascade_rec(
      fk.child,
      format('(%s) IN (SELECT %s FROM %s WHERE %s)', fk.child_cols, fk.parent_cols, p_rel, p_cond),
      p_path || fk.child_oid
    );
  END LOOP;

  EXECUTE format('DELETE FROM %s WHERE %s', p_rel, p_cond);
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n > 0 THEN
    INSERT INTO _del_log VALUES (p_rel::text, n);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION delete_cliente_cascade(p_cliente_id text)
RETURNS TABLE(tabla text, filas bigint) LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cliente WHERE id::text = p_cliente_id) THEN
    RAISE EXCEPTION 'cliente % no existe', p_cliente_id;
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS _del_log(tabla text, filas bigint) ON COMMIT DROP;
  TRUNCATE _del_log;

  PERFORM _del_cascade_rec('cliente'::regclass, format('id = %L', p_cliente_id), ARRAY['cliente'::regclass::oid]);

  RETURN QUERY SELECT l.tabla, l.filas FROM _del_log l ORDER BY l.filas DESC, l.tabla;
END $$;

-- ---------------------------------------------------------------------------
-- Lo que NO cubre una FK (revisar antes del COMMIT)
-- ---------------------------------------------------------------------------

-- 1) Columnas cliente_id / tenant_id SIN foreign key (quedarían huérfanas):
SELECT c.table_name, c.column_name
FROM information_schema.columns c
WHERE c.table_schema = 'public'
  AND c.column_name IN ('cliente_id', 'tenant_id', 'id_cliente')
  AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint k
    JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = ANY (k.conkey)
    WHERE k.contype = 'f'
      AND k.conrelid = format('%I.%I', c.table_schema, c.table_name)::regclass
      AND a.attname = c.column_name
  );

-- 2) Checkpoints de LangGraph: thread_id = 'tenantId:userId', no hay FK.
--    Descomentar dentro de la misma transacción:
-- DELETE FROM checkpoint_writes WHERE thread_id LIKE '123:%';
-- DELETE FROM checkpoint_blobs  WHERE thread_id LIKE '123:%';
-- DELETE FROM checkpoints       WHERE thread_id LIKE '123:%';
