# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Start server (runs ESLint first via prestart hook)
npm start

# Run tests
npm test

# Run a single test file
npx mocha tests/<file>.js --exit --timeout 5000

# Lint only
npx eslint . --no-ignore
```


### Entry Point

`node.js` is the Express app entry point (not `app.js`). It registers all routes under `/api/*` and exports the app for testing.

`pool.js` holds the shared PostgreSQL connection pool used throughout the app.

### Layer Pattern

Every domain follows a strict 3-layer pattern:

```
routes/ → controllers/ → services/ → model/
```

- **Routes** — Express routers, apply middleware chains, delegate to controllers
- **Controllers** — Handle HTTP req/res, call services, return JSON
- **Services** — Business logic, validation, orchestration
- **Models** (`model/<domain>/db.js`) — Raw SQL queries via `pool.query()` — no ORM

### Middleware Stack

Applied per-route, typically in this order:

1. `authenticateJWT` — Validates JWT from `Authorization: Bearer <token>`
2. `authorizeRole(['admin', ...])` — Checks user role
3. `authorizeModule('moduleName')` — Checks if user's plan includes the module
4. `authorizePermission('module', 'module.action', 'AND'|'OR')` — Granular permission check
5. `checkFeature('featureName')` — Plan-tier feature flag gate
6. `checkLimit('limitKey')` — Enforces usage limits (e.g., max products, max monthly orders)

### Multi-Tenancy

All data is scoped by `cliente_id`. Every query filters by `cliente_id` to isolate tenant data. Users belong to a `cliente`, and each `cliente` has an assigned plan/tier.

### Key Integrations

| Integration | Purpose | Config |
|-------------|---------|--------|
| MercadoPago | Subscriptions, checkout, webhooks at `/api/billing/webhook` | `services/billing/mercadoPagoService.js` |
| Meta Cloud API | WhatsApp message/template sending | `services/whatsaap/` |
| Cloudinary | Product image storage | `config/cloudinary.js` |
| Nodemailer/Gmail | Welcome emails | `services/email/emailService.js` |
| N8N | Workflow automation (token-authenticated) | env var `N8N_TOKEN` |

### Plan & Feature Gating

- `middleware/featureMiddleware.js` — Blocks access if the client's tier doesn't include a feature or the subscription has expired
- `middleware/limitMiddleware.js` — Enforces numeric limits per tier (e.g., `maxProductos`, `maxPedidosMensuales`)
- Tier expiration runs daily via Vercel cron: `GET /api/cron/expire-tiers` at 3 AM

### Auth Flow

JWT tokens are issued at `/api/auth`. The token payload includes `cliente_id`, `user_id`, and role. Permissions and modules are loaded from the DB and checked against the token on each request.


# Counter CRM

SaaS multi-tenant para LATAM SMBs. Backend Node.js, frontend Next.js, base de datos PostgreSQL (Neon), deploy en Vercel.

## Tech Stack
- **Backend**: Node.js 22, Express, CommonJS
- **Frontend**: Next.js 15, React, Tailwind CSS
- **DB**: PostgreSQL (Neon) — acceso directo con `pg`, sin ORM
- **Deploy**: Vercel (frontend + API routes), Neon (DB)
- **Integraciones**: Meta Graph API (WhatsApp Business), JWT para auth

## Arquitectura de módulos (patrón obligatorio)
This is a multi-tenant SaaS CRM REST API built with **Express.js + PostgreSQL (Neon Cloud)**, deployed on Vercel.
```
src/
  modules/
    <modulo>/
      model/db.js          ← queries SQL puras, sin lógica de negocio
      services/service.js  ← lógica de negocio, orquesta el model
      controllers/controller.js ← maneja req/res, llama al service
      routes/route.js      ← define endpoints Express
```

Cada módulo nuevo DEBE seguir esta estructura. No mezclar capas.

## Multi-tenancy
- Cada tenant tiene su propio `tenant_id` (UUID)
- Todas las queries deben filtrar por `tenant_id` — nunca consultar sin él
- El `tenant_id` viene del JWT decodificado en el middleware de auth
- RLS (Row Level Security) habilitado en Neon — siempre setear `app.current_tenant_id`

## Convenciones de código

### Naming
- Archivos y carpetas: kebab-case (`user-accounts/`)
- Funciones y variables: camelCase (`getUserById`)
- Tablas y columnas SQL: snake_case (`user_accounts`, `created_at`)
- Constantes: UPPER_SNAKE_CASE (`MAX_RETRY_COUNT`)

### Errores
- Todos los errores se wrappean en `AppError(message, statusCode)`
- Nunca exponer stack traces al cliente en producción
- Los controllers usan try/catch y pasan al `next(error)` de Express
- Códigos estándar: 400 validación, 401 no autenticado, 403 sin permiso, 404 no encontrado, 409 conflicto, 500 interno

### Respuestas HTTP
```json
{ "data": {}, "meta": {}, "error": null }
```
En error: `{ "data": null, "error": { "code": "NOT_FOUND", "message": "..." } }`

### SQL
- Queries parametrizadas SIEMPRE — nunca interpolación de strings
- Transacciones para operaciones que tocan múltiples tablas
- Índices en foreign keys y columnas de filtro frecuente

## Variables de entorno importantes
```
DATABASE_URL          ← Neon connection string
JWT_SECRET            ← firma de tokens
META_APP_SECRET       ← WhatsApp / Meta Graph API
WHATSAPP_TOKEN        ← token de acceso Meta
```

## Delegación de trabajo (para subagents)

Cuando una tarea toca múltiples dominios, trabajar en paralelo:
- Lógica de negocio + DB → `backend-dev`
- Componentes UI / páginas Next.js → `frontend-dev`
- Queries y schema → `db-specialist`
- Tests → `tester` (spawnear después de implementar)
- Revisión de PR → `code-reviewer`

## Comandos útiles
```bash
npm run dev          # servidor Express en desarrollo
npm run build        # build Next.js
npm run test         # Vitest
npm run migrate      # correr migraciones SQL
```
