# MercadoPago Sandbox Setup

## Contexto

El módulo de MercadoPago funcionaba en producción pero nunca fue testeado en desarrollo.
Se encontraron 4 bugs bloqueantes y se dejó el entorno listo para sandbox sin tocar producción.

---

## Bugs corregidos

| # | Archivo | Problema | Fix |
|---|---------|---------|-----|
| 1 | `.env` | `MERCADOPAGO_ACCESS_TOKEN` tenía dos tokens pegados con `#` | Separados: `TEST-...` activo, `APP_USR-...` comentado |
| 2 | `services/billing/mercadoPagoService.js` | `payerEmail` no definido en `createOneTimePayment` → `ReferenceError` | `cliente.contacto_email \|\| process.env.MERCADOPAGO_TEST_PAYER_EMAIL` |
| 3 | `services/billing/mercadoPagoService.js` | `createOneTimePayment` no enviaba `external_reference` en la Preference | Agregado `external_reference: "cliente-{id}"` |
| 4 | `routes/billingWebhook.js` | Webhook de pago único leía `clienteId` de `payment.additional_info?.payer?.id` (nunca mapea al id interno) | Cambiado a `payment.external_reference` |
| 5 | `routes/expireTiers.js` | Era un script standalone con `pool.end()`, no un router Express | Convertido a router; montado en `node.js` en `/api/cron/expire-tiers` |

---

## Cómo funciona el modo mock (desarrollo sin MP)

Controlado por la variable `MP_MOCK=true` en `.env`.

```bash
# Activar mock mode
MP_MOCK=true

# Correr tests
npx mocha tests/billing.test.js --exit --timeout 5000
```

Flujo mock:
1. `POST /api/billing/checkout` → devuelve `initPoint` y `preapprovalId` falsos
2. `POST /api/billing/webhook/mock { preapprovalId }` → activa la suscripción en DB
3. No hay llamadas reales a la API de MercadoPago

---

## Setup sandbox real (una vez por cuenta)

### 1. Obtener credenciales de prueba
Ir a [mercadopago.com.ar/developers/panel](https://mercadopago.com.ar/developers/panel) → tu app → **Credenciales de prueba** → copiar token `TEST-...`

### 2. Crear test users
```bash
# Seller test user (sus credenciales van en MERCADOPAGO_ACCESS_TOKEN)
curl -X POST 'https://api.mercadopago.com/users/test' \
  -H 'Authorization: Bearer TEST-...' \
  -d '{"site_id":"MLA","description":"Seller CRM"}'

# Buyer test user (su email va en MERCADOPAGO_TEST_PAYER_EMAIL)
curl -X POST 'https://api.mercadopago.com/users/test' \
  -H 'Authorization: Bearer TEST-...' \
  -d '{"site_id":"MLA","description":"Buyer CRM"}'
```
Guardar el `email` y `password` del buyer — MP no tiene endpoint para recuperarlos.

### 3. Configurar `.env` para sandbox
```dotenv
MP_MOCK=false
MERCADOPAGO_ACCESS_TOKEN=TEST-...       # token del seller test user
MERCADOPAGO_TEST_PAYER_EMAIL=test_user_xxx@testuser.com  # email del buyer test user
MERCADOPAGO_WEBHOOK_URL=https://xxxx.ngrok-free.app/api/billing/webhook
MP_WEBHOOK_SECRET=<secret del panel → Webhooks>
```

### 4. Exponer localhost con ngrok
```bash
ngrok http 3001
# Copiar la URL https://xxxx.ngrok-free.app y actualizar .env + panel de MP
```

### 5. Test end-to-end
1. `POST /api/billing/checkout` con JWT válido y `{ "tierCode": "BASIC" }`
2. Abrir el `initPoint` en el browser logueado como buyer test user
3. Pagar con tarjeta de prueba:
   - Número: `5031 7557 3453 0604`
   - CVV: `123` | Vencimiento: `11/25` | Nombre: **`APRO`** (= aprobado)
4. Verificar en ngrok que llega el webhook `preapproval`
5. Verificar en DB: `SELECT status FROM billing_subscription WHERE mp_preapproval_id = '...'`

---

## Archivos clave del módulo

| Archivo | Rol |
|---------|-----|
| `services/billing/mercadoPagoService.js` | SDK init, createSubscription, createOneTimePayment, simulateWebhook |
| `routes/billing.js` | `POST /api/billing/checkout` (requiere JWT) |
| `routes/billingWebhook.js` | `POST /api/billing/webhook` (real) + `/mock` |
| `routes/expireTiers.js` | `GET /api/cron/expire-tiers` (cron Vercel 3am UTC) |
| `tests/billing.test.js` | 9 tests con MP_MOCK=true, sin DB ni MP reales |
| `.env.example` | Template con todas las variables documentadas |

---

## Testing desde Postman (paso a paso)

### Prerrequisitos
- Servidor corriendo: `npm start` (puerto 3001)
- `.env` configurado con `MP_MOCK=true` para el flujo mock, o `MP_MOCK=false` + token `TEST-...` para sandbox real
- Tener un JWT válido (ver paso 1)

---

### Paso 1 — Obtener un JWT

**Request**
```
POST http://localhost:3001/api/auth/login
Content-Type: application/json

{
  "email": "tu-usuario@empresa.com",
  "password": "tu-password"
}
```

**Guardar el token:** En Postman, ir a la pestaña **Tests** del request de login y agregar:
```js
pm.environment.set("JWT_TOKEN", pm.response.json().token);
```
Así los demás requests lo usan automáticamente con `{{JWT_TOKEN}}`.

---

### Paso 2 — Iniciar checkout de suscripción

**Request**
```
POST http://localhost:3001/api/billing/checkout
Authorization: Bearer {{JWT_TOKEN}}
Content-Type: application/json

{
  "tierCode": "BASIC"
}
```

**Respuesta esperada (mock mode)**
```json
{
  "initPoint": "https://fake-mp-checkout.com/pay/mock-preapproval-1234567890",
  "preapprovalId": "mock-preapproval-1234567890"
}
```

**Respuesta esperada (sandbox real)**
```json
{
  "initPoint": "https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_plan_id=...",
  "preapprovalId": "2c938084726fca480172750000000000"
}
```

Guardar el `preapprovalId` para el siguiente paso:
```js
// En pestaña Tests del request
pm.environment.set("PREAPPROVAL_ID", pm.response.json().preapprovalId);
```

---

### Paso 3a — Simular webhook (mock mode)

Usar este paso cuando `MP_MOCK=true`. Simula que MercadoPago confirmó el pago.

**Request**
```
POST http://localhost:3001/api/billing/webhook/mock
Content-Type: application/json

{
  "preapprovalId": "{{PREAPPROVAL_ID}}"
}
```

**Respuesta esperada**
```json
{ "ok": true }
```

---

### Paso 3b — Simular webhook manualmente (sandbox real)

Cuando `MP_MOCK=false`, MercadoPago envía el webhook automáticamente al completar el pago en el browser. Pero también se puede disparar manualmente para testear el handler:

**Request**
```
POST http://localhost:3001/api/billing/webhook
Content-Type: application/json

{
  "type": "preapproval",
  "data": {
    "id": "{{PREAPPROVAL_ID}}"
  }
}
```

> Nota: si `MP_WEBHOOK_SECRET` está seteado en `.env`, este request será rechazado con 401 porque no lleva firma HMAC. Para testearlo sin firma, dejar `MP_WEBHOOK_SECRET` vacío en desarrollo.

**Respuesta esperada**
```
200 OK
```

---

### Paso 4 — Verificar que el plan se activó

**Request**
```
GET http://localhost:3001/api/cliente-plan/mi-plan
Authorization: Bearer {{JWT_TOKEN}}
```

**Respuesta esperada**
```json
{
  "clienteId": 1,
  "tierCode": "BASIC",
  "tierNombre": "Plan Basic",
  "features": { ... },
  "isExpired": false
}
```

---

### Paso 5 — Testear expiración de planes (cron)

```
GET http://localhost:3001/api/cron/expire-tiers
```

**Respuesta esperada**
```json
{ "degraded": 0 }
```
El número indica cuántos clientes fueron degradados a FREE por tener `tier_expiration_date` vencida.

---

### Colección Postman sugerida

Estructura de carpetas:
```
Counter CRM - Billing
  ├── Auth
  │   └── Login → guarda JWT_TOKEN
  ├── Billing (Mock)
  │   ├── POST /checkout → guarda PREAPPROVAL_ID
  │   └── POST /webhook/mock
  ├── Billing (Sandbox real)
  │   ├── POST /checkout
  │   └── POST /webhook (manual)
  ├── Plan
  │   └── GET /cliente-plan/mi-plan
  └── Cron
      └── GET /cron/expire-tiers
```

### Variables de entorno Postman

| Variable | Valor inicial |
|----------|--------------|
| `BASE_URL` | `http://localhost:3001` |
| `JWT_TOKEN` | *(se llena al hacer login)* |
| `PREAPPROVAL_ID` | *(se llena al hacer checkout)* |

---

## Tarjetas de prueba Argentina (MLA)

| Número | CVV | Vencimiento | Nombre → resultado |
|--------|-----|-------------|-------------------|
| `5031 7557 3453 0604` | `123` | `11/25` | `APRO` = aprobado |
| `5031 7557 3453 0604` | `123` | `11/25` | `FUND` = fondos insuficientes |
| `5031 7557 3453 0604` | `123` | `11/25` | `OTHE` = error genérico |
