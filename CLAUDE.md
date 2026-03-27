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

## Architecture

This is a multi-tenant SaaS CRM REST API built with **Express.js + PostgreSQL (Neon Cloud)**, deployed on Vercel.

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

### Environment Variables

Required in `.env`: `JWT_SECRET`, `DATABASE_URL`, `MP_ACCESS_TOKEN`, `CLOUDINARY_*`, `EMAIL_USER`/`EMAIL_PASS`, `META_TOKEN`/`PHONE_NUMBER_ID`, `N8N_TOKEN`, `PORT`.
