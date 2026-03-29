# Skill: DB Schema — Counter CRM

Schema de referencia de la base de datos PostgreSQL de Counter CRM.

## Tablas principales

```sql
-- Tenants (raíz del sistema)
tenants (
  id          UUID PK,
  nombre      TEXT NOT NULL,
  slug        TEXT UNIQUE NOT NULL,
  plan_id     UUID FK → planes(id),
  activo      BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ
)

-- Usuarios
users (
  id          UUID PK,
  tenant_id   UUID FK → tenants(id),
  email       TEXT NOT NULL,
  nombre      TEXT NOT NULL,
  role        TEXT DEFAULT 'member',  -- 'owner', 'admin', 'member'
  deleted_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ
)

-- Contactos del CRM
contactos (
  id          UUID PK,
  tenant_id   UUID FK → tenants(id),
  nombre      TEXT NOT NULL,
  telefono    TEXT,   -- formato internacional: +54911...
  email       TEXT,
  empresa     TEXT,
  tags        TEXT[],
  metadata    JSONB DEFAULT '{}',
  deleted_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ,
  updated_at  TIMESTAMPTZ
)

-- Cuentas WhatsApp por tenant
whatsapp_accounts (
  id              UUID PK,
  tenant_id       UUID FK → tenants(id),
  wa_phone_id     TEXT NOT NULL,  -- phone_number_id de Meta
  waba_id         TEXT NOT NULL,  -- WhatsApp Business Account ID
  phone_number    TEXT NOT NULL,  -- número en formato E.164
  display_name    TEXT,
  status          TEXT DEFAULT 'pending',  -- 'pending', 'active', 'banned'
  access_token    TEXT,           -- token de acceso (encriptado)
  created_at      TIMESTAMPTZ
)

-- Mensajes WhatsApp
mensajes_whatsapp (
  id              UUID PK,
  tenant_id       UUID FK → tenants(id),
  contacto_id     UUID FK → contactos(id),
  wa_phone_id     TEXT NOT NULL,
  wa_message_id   TEXT,           -- wamid de Meta
  direccion       TEXT NOT NULL,  -- 'inbound', 'outbound'
  tipo            TEXT NOT NULL,  -- 'text', 'template', 'image', etc.
  contenido       JSONB NOT NULL,
  status          TEXT DEFAULT 'sent',  -- 'sent', 'delivered', 'read', 'failed'
  created_at      TIMESTAMPTZ
)

-- Planes (tabla global, sin tenant_id)
planes (
  id          UUID PK,
  nombre      TEXT NOT NULL,  -- 'starter', 'pro', 'enterprise'
  precio_usd  NUMERIC(10,2),
  max_usuarios    INT,
  max_contactos   INT,
  max_wa_numbers  INT,
  activo      BOOLEAN DEFAULT true
)
```

## Índices definidos

```sql
-- Contactos
CREATE INDEX idx_contactos_tenant ON contactos(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_contactos_telefono ON contactos(tenant_id, telefono);
CREATE INDEX idx_contactos_email ON contactos(tenant_id, email);

-- WhatsApp accounts
CREATE UNIQUE INDEX idx_wa_accounts_phone_id ON whatsapp_accounts(wa_phone_id);
CREATE INDEX idx_wa_accounts_tenant ON whatsapp_accounts(tenant_id);

-- Mensajes
CREATE INDEX idx_mensajes_tenant ON mensajes_whatsapp(tenant_id, created_at DESC);
CREATE INDEX idx_mensajes_contacto ON mensajes_whatsapp(contacto_id, created_at DESC);
```

## Convenciones de migración

Archivos en `migrations/` con formato: `YYYYMMDD_HHMM_descripcion.sql`

```sql
-- migrations/20240315_1400_add_tags_to_contactos.sql
BEGIN;

ALTER TABLE contactos ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
CREATE INDEX IF NOT EXISTS idx_contactos_tags ON contactos USING GIN(tags);

COMMIT;
```

## Pool de conexiones

```js
// src/db/pool.js
import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

export default pool;
```
