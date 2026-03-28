    # Counter CRM

SaaS multi-tenant para LATAM SMBs. Backend Node.js, frontend Next.js, base de datos PostgreSQL (Neon), deploy en Vercel.

## Tech Stack
- **Backend**: Node.js 22, Express, CommonJS
- **Frontend**: Next.js 15, React, Tailwind CSS
- **DB**: PostgreSQL (Neon) — acceso directo con `pg`, sin ORM
- **Deploy**: Vercel (frontend + API routes), Neon (DB)
- **Integraciones**: Meta Graph API (WhatsApp Business), JWT para auth

## Arquitectura de módulos (patrón obligatorio)

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
