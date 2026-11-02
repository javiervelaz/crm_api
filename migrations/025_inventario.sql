-- migrations/025_inventario.sql
--
-- Inventario — Fase 0 (plan: PLAN_INVENTARIO_v2_2026-10-28).
--
-- · Drop de las tablas legacy (inventario_insumos, compra_insumo,
--   movimiento_inventario): vacías en prod (verificado 02/11/2026) y sin
--   código que las use desde d534d9e. Si alguna tiene filas, la migración
--   aborta y no toca nada.
-- · stock_item + stock_movimiento (ledger append-only) + vista stock_saldo.
--   El stock NO se cachea: es SUM(cantidad) del ledger.
--   Unidades canónicas u/kg/l (la UI convierte g y ml).
--   (stock_item_id, cliente_id) es FK compuesta: un movimiento no puede
--   apuntar a un ítem de otro comercio aunque el código se equivoque.
-- · Módulo `inventario` en el catálogo y en la plantilla de gastronomía.
--   Backfill de los comercios existentes: módulo, acceso del rol admin y
--   permisos inventario.list/create/update/delete (patrón de 015).
-- · Features en rubro_tier (gastronomía): FREE sin inventario, BASIC hasta
--   50 ítems sin recetas, PREMIUM/CUSTOM sin límite con recetas. Sólo se
--   setean si la clave no existe: no pisa ajustes manuales.
--
-- Recetas (Fase 2) van en su propia migración.
--
-- Idempotente.

BEGIN;

-- ─── Legacy ───────────────────────────────────────────────────────────────
DO $$
DECLARE t text; n bigint;
BEGIN
  FOREACH t IN ARRAY ARRAY['movimiento_inventario','compra_insumo','inventario_insumos'] LOOP
    IF to_regclass(t) IS NOT NULL THEN
      EXECUTE format('SELECT count(*) FROM %I', t) INTO n;
      IF n > 0 THEN
        RAISE EXCEPTION 'Tabla legacy % tiene % filas: revisar antes de dropear', t, n;
      END IF;
    END IF;
  END LOOP;
END $$;

DROP TABLE IF EXISTS movimiento_inventario;
DROP TABLE IF EXISTS compra_insumo;
DROP TABLE IF EXISTS inventario_insumos;

-- ─── Tablas ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stock_item (
  id             SERIAL PRIMARY KEY,
  cliente_id     INT           NOT NULL REFERENCES cliente (id),     -- sin DEFAULT
  sucursal_id    INT           NOT NULL REFERENCES sucursal (id),
  nombre         VARCHAR(120)  NOT NULL CHECK (length(btrim(nombre)) > 0),
  tipo           VARCHAR(10)   NOT NULL CHECK (tipo IN ('insumo','producto')),
  unidad         VARCHAR(2)    NOT NULL CHECK (unidad IN ('u','kg','l')),
  stock_minimo   NUMERIC(14,3) CHECK (stock_minimo IS NULL OR stock_minimo >= 0),
  costo_unitario NUMERIC(14,4) CHECK (costo_unitario IS NULL OR costo_unitario >= 0),
  activo         BOOLEAN       NOT NULL DEFAULT true,
  created_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT stock_item_id_cliente_uq UNIQUE (id, cliente_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS stock_item_nombre_uq
  ON stock_item (cliente_id, sucursal_id, lower(nombre));

-- Append-only: nunca UPDATE ni DELETE (salvo la purga de tenants).
CREATE TABLE IF NOT EXISTS stock_movimiento (
  id             BIGSERIAL     PRIMARY KEY,
  cliente_id     INT           NOT NULL REFERENCES cliente (id),
  stock_item_id  INT           NOT NULL,
  tipo           VARCHAR(14)   NOT NULL
                 CHECK (tipo IN ('compra','ajuste','merma','venta','reversa_venta')),
  cantidad       NUMERIC(14,3) NOT NULL CHECK (cantidad <> 0),           -- con signo
  costo_total    NUMERIC(14,2) CHECK (costo_total IS NULL OR costo_total >= 0),
  -- Los pedidos y gastos se borran físicamente: el movimiento sobrevive.
  pedido_id      INT           REFERENCES pedido (id)      ON DELETE SET NULL,
  salida_caja_id INT           REFERENCES salida_caja (id) ON DELETE SET NULL,
  usuario_id     INT           NOT NULL REFERENCES "user" (id),          -- del JWT
  nota           VARCHAR(200),
  created_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT stock_mov_item_fk FOREIGN KEY (stock_item_id, cliente_id)
    REFERENCES stock_item (id, cliente_id),
  CONSTRAINT stock_mov_signo_ck CHECK (
       (tipo IN ('compra','reversa_venta') AND cantidad > 0)
    OR (tipo IN ('merma','venta')          AND cantidad < 0)
    OR  tipo = 'ajuste'
  )
);
CREATE INDEX IF NOT EXISTS stock_mov_item_idx
  ON stock_movimiento (cliente_id, stock_item_id);
CREATE INDEX IF NOT EXISTS stock_mov_pedido_idx
  ON stock_movimiento (pedido_id) WHERE pedido_id IS NOT NULL;

-- Stock por ítem. Las consultas igual filtran por cliente_id.
CREATE OR REPLACE VIEW stock_saldo AS
SELECT i.*, COALESCE(SUM(m.cantidad), 0)::NUMERIC(14,3) AS stock
  FROM stock_item i
  LEFT JOIN stock_movimiento m
         ON m.stock_item_id = i.id AND m.cliente_id = i.cliente_id
 GROUP BY i.id;

-- ─── Módulo ───────────────────────────────────────────────────────────────
INSERT INTO modulo_maestro (codigo, descripcion, status)
SELECT 'inventario', 'Inventario y stock', true
 WHERE NOT EXISTS (SELECT 1 FROM modulo_maestro WHERE codigo = 'inventario');

INSERT INTO rubro_modulo_maestro (rubro_codigo, modulo_maestro_id, config_default)
SELECT 'gastronomia', mm.id, '{}'::jsonb
  FROM modulo_maestro mm
 WHERE mm.codigo = 'inventario'
ON CONFLICT DO NOTHING;

-- ─── Backfill de comercios existentes ─────────────────────────────────────
INSERT INTO modulo (codigo, descripcion, status, cliente_id, config)
SELECT mm.codigo, mm.descripcion, true, c.id, rmm.config_default
  FROM cliente c
  JOIN rubro_modulo_maestro rmm ON rmm.rubro_codigo = c.rubro_codigo
  JOIN modulo_maestro mm        ON mm.id = rmm.modulo_maestro_id AND mm.codigo = 'inventario'
 WHERE NOT EXISTS (
         SELECT 1 FROM modulo m
          WHERE m.cliente_id = c.id AND m.codigo = 'inventario' AND m.deleted_at IS NULL
       );

INSERT INTO modulo_rol (id_rol, id_modulo, cliente_id)
SELECT r.id, m.id, m.cliente_id
  FROM modulo m
  JOIN rol r ON r.cliente_id = m.cliente_id
  LEFT JOIN user_type ut ON ut.id = r.user_type_id
 WHERE m.codigo = 'inventario' AND m.deleted_at IS NULL
   AND (ut.codigo = 'ADMIN' OR (r.user_type_id IS NULL AND lower(r.descripcion) = 'admin'))
   AND NOT EXISTS (
         SELECT 1 FROM modulo_rol mr WHERE mr.id_rol = r.id AND mr.id_modulo = m.id
       );

INSERT INTO permiso (descripcion, codigo, modulo_id, cliente_id, es_global)
SELECT pa.descripcion || ' - ' || m.descripcion, m.codigo || '.' || pa.codigo, m.id, m.cliente_id, false
  FROM modulo m
 CROSS JOIN permiso_accion pa
 WHERE m.codigo = 'inventario' AND m.deleted_at IS NULL
   AND NOT EXISTS (
         SELECT 1 FROM permiso p
          WHERE p.cliente_id = m.cliente_id AND p.codigo = m.codigo || '.' || pa.codigo
       );

INSERT INTO rol_permiso (rol_id, permiso_id, cliente_id)
SELECT mr.id_rol, p.id, p.cliente_id
  FROM permiso p
  JOIN modulo m      ON m.id = p.modulo_id AND m.codigo = 'inventario'
  JOIN modulo_rol mr ON mr.id_modulo = m.id
 WHERE NOT EXISTS (
         SELECT 1 FROM rol_permiso rp WHERE rp.rol_id = mr.id_rol AND rp.permiso_id = p.id
       );

-- ─── Features por tier (gastronomía) ──────────────────────────────────────
UPDATE rubro_tier rt
   SET features = rt.features || f.features, updated_at = NOW()
  FROM tier t
  JOIN (VALUES
    ('FREE',    '{"canUseInventario": false, "canUseRecetas": false, "maxStockItems": null}'::jsonb),
    ('BASIC',   '{"canUseInventario": true,  "canUseRecetas": false, "maxStockItems": 50}'::jsonb),
    ('PREMIUM', '{"canUseInventario": true,  "canUseRecetas": true,  "maxStockItems": null}'::jsonb),
    ('CUSTOM',  '{"canUseInventario": true,  "canUseRecetas": true,  "maxStockItems": null}'::jsonb)
  ) AS f(code, features) ON f.code = UPPER(t.code)
 WHERE rt.tier_id = t.id
   AND rt.rubro_codigo = 'gastronomia'
   AND NOT rt.features ? 'canUseInventario';

-- Resto de los rubros: explícitamente sin inventario.
UPDATE rubro_tier
   SET features = features || '{"canUseInventario": false, "canUseRecetas": false, "maxStockItems": null}'::jsonb,
       updated_at = NOW()
 WHERE rubro_codigo <> 'gastronomia'
   AND NOT features ? 'canUseInventario';

COMMIT;
