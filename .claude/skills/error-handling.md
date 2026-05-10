# Skill: Error Handling — Counter CRM

## AppError — clase base de errores

```js
// src/utils/AppError.js
class AppError extends Error {
  constructor(message, statusCode, code = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code || AppError.codeFromStatus(statusCode);
    this.isOperational = true; // errores esperados, no bugs
  }

  static codeFromStatus(status) {
    const map = {
      400: 'VALIDATION_ERROR',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      422: 'UNPROCESSABLE',
      500: 'INTERNAL_ERROR',
    };
    return map[status] || 'ERROR';
  }
}
```

## Middleware global de errores

```js
// src/middleware/errorHandler.js
const errorHandler = (err, req, res, next) => {
  const isDev = process.env.NODE_ENV === 'development';

  if (err.isOperational) {
    return res.status(err.statusCode).json({
      data: null,
      error: {
        code: err.code,
        message: err.message,
        ...(isDev && { stack: err.stack }),
      },
    });
  }

  // Error no esperado — loggear y responder genérico
  console.error('ERROR NO OPERACIONAL:', err);
  res.status(500).json({
    data: null,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Ocurrió un error interno. Intente más tarde.',
    },
  });
};
```

## Patrones de uso en services

```js
// Validación de input
if (!data.nombre?.trim()) {
  throw new AppError('El nombre es requerido', 400);
}

// Recurso no encontrado
const contacto = await db.getById(client, tenantId, id);
if (!contacto) {
  throw new AppError('Contacto no encontrado', 404);
}

// Conflicto (ya existe)
const existe = await db.findByEmail(client, tenantId, data.email);
if (existe) {
  throw new AppError('Ya existe un contacto con ese email', 409);
}

// Error de DB: constraint violation
try {
  await db.create(client, tenantId, data);
} catch (err) {
  if (err.code === '23505') { // unique_violation
    throw new AppError('El registro ya existe', 409);
  }
  throw err; // re-throw para que llegue al error handler global
}
```

## Errores comunes de PostgreSQL
| Código PG | Significado | AppError recomendado |
|-----------|-------------|----------------------|
| `23505` | unique_violation | 409 Conflict |
| `23503` | foreign_key_violation | 400 Bad Request |
| `23502` | not_null_violation | 400 Bad Request |
| `42P01` | tabla no existe | 500 (bug, re-throw) |
| `ECONNREFUSED` | DB no disponible | 503 Service Unavailable |

## Controllers: siempre try/catch + next

```js
const createContacto = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const result = await service.createContacto(tenantId, req.body);
    res.status(201).json({ data: result, error: null });
  } catch (err) {
    next(err); // delegar al errorHandler global
  }
};
```

## Nunca hacer esto
```js
// ❌ Exponer stack trace en producción
res.status(500).json({ error: err.stack });

// ❌ Swallow errors silencioso
try { ... } catch (err) { console.log(err); }

// ❌ throw genérico sin status
throw new Error('algo salió mal');

// ❌ Responder y también llamar next
res.status(400).json({ error: 'bad' });
next(err); // doble respuesta → crash
```
