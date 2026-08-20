# Módulo de email

Cola transaccional + render de templates + envío por proveedor intercambiable.

## Uso

```js
const mailer = require('../services/email');

// Encolar (vía normal). Si pasás `tx`, entra en tu transacción:
// si el COMMIT falla no queda un mail huérfano; si sale, el mail está garantizado.
await mailer.enqueue({
  template: 'welcome',
  to: 'javi@comercio.com',
  toName: 'Javier',
  clienteId: 42,
  idempotencyKey: `welcome:42`,   // evita duplicados
  data: { nombreComercio: 'La Esquina', plan: 'FREE', /* ... */ },
}, client);

await mailer.drain({ limit: 20 });        // lo usan el cron y el worker
mailer.render('welcome', data);           // { subject, html, text }, sin enviar
await mailer.sendNow({ ... });            // sin cola, cuando necesitás el resultado ya
await mailer.stats();                     // { pending: 3, sent: 120, failed: 1 }
```

## Agregar un template

1. `templates/mi-template.mjml` — el HTML, con `{{variables}}` de Handlebars.
2. `templates/mi-template.subject.hbs` — el asunto, una línea.
3. `templates/mi-template.txt.hbs` — la versión de texto plano. **No es opcional**:
   sin ella los filtros anti-spam penalizan el mail.
4. `npm run email:build` — compila el MJML a `templates/dist/`.
5. `npm run email:preview mi-template` — lo renderiza y te dice dónde quedó el HTML.

En `href` usá siempre el helper: `href="{{url miUrl}}"`. El escape por defecto de
Handlebars convierte `?token=abc` en `?token&#x3D;abc`, y el helper además corta
cualquier esquema que no sea `http(s)`.

**`templates/dist/` se commitea.** Producción no tiene `mjml` instalado (es
devDependency) y en Vercel no corre el `prestart`.

## Estados de la cola

```
pending ──claim──> sending ──ok────> sent
   ▲                  │
   └──backoff─────────┴──error transitorio (1, 2, 4, 8, 16 min)
                      └──error permanente o 5 intentos──> failed
```

Un 4xx del proveedor (destinatario inválido, dominio no verificado) va directo a
`failed`: reintentarlo es quemar cuota. El 429 sí reintenta.

## Despacho

En Vercel el drenado se dispara por dos vías:

- **Camino rápido:** `waitUntil(mailer.drain())` post-respuesta, en el mismo request.
- **Red de seguridad:** `POST /api/cron/email-outbox` con `Authorization: Bearer $CRON_SECRET`,
  disparado por n8n cada 60s. **No** por los crons de Vercel: en plan Hobby corren
  una vez por día.

En un VPS, `npm run email:worker` levanta el loop persistente y no hace falta el cron.

## Variables de entorno

Ver el bloque `# ─── Email ───` en `.env.example`.

El default de `EMAIL_PROVIDER` fuera de producción es `console`: los mails van a
stdout. Es deliberado — evita mandar pruebas a clientes reales.
