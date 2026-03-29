# Skill: API Conventions — Counter CRM

Convenciones de API para todos los módulos de Counter CRM.

## Estructura de respuesta HTTP

### Éxito
```json
{
  "data": { ... },
  "meta": {
    "total": 100,
    "page": 1,
    "per_page": 20
  },
  "error": null
}
```

### Error
```json
{
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "El campo nombre es requerido"
  }
}
```

## Códigos de estado HTTP
| Código | Cuándo usar |
|--------|-------------|
| 200 | GET, PUT/PATCH exitoso |
| 201 | POST exitoso (recurso creado) |
| 204 | DELETE exitoso (sin body) |
| 400 | Error de validación / input inválido |
| 401 | Sin autenticación o token inválido |
| 403 | Autenticado pero sin permiso |
| 404 | Recurso no encontrado |
| 409 | Conflicto (ej: ya existe) |
| 422 | Entidad no procesable |
| 500 | Error interno del servidor |

## Naming de endpoints
```
GET    /api/v1/contactos           ← listar
GET    /api/v1/contactos/:id       ← obtener uno
POST   /api/v1/contactos           ← crear
PUT    /api/v1/contactos/:id       ← reemplazar
PATCH  /api/v1/contactos/:id       ← actualizar parcialmente
DELETE /api/v1/contactos/:id       ← eliminar

# Acciones no-CRUD: verbo como sub-recurso
POST   /api/v1/whatsapp/send/text
POST   /api/v1/whatsapp/send/template
POST   /api/v1/contactos/:id/archivar
GET    /api/v1/contactos/:id/historial
```

## Paginación
```
GET /api/v1/contactos?page=1&per_page=20&search=juan&sort=created_at&order=desc
```

Response `meta`:
```json
{
  "total": 150,
  "page": 1,
  "per_page": 20,
  "total_pages": 8
}
```

## Naming de funciones por capa
```
model/db.js     → getAll, getById, create, update, softDelete
service.js      → getContactos, getContactoById, createContacto, updateContacto
controller.js   → index, show, create, update, destroy
routes/route.js → router.get('/', ...), router.post('/', ...)
```

## Formato de fechas
- Siempre UTC en la base de datos: `TIMESTAMPTZ`
- ISO 8601 en la API: `"2024-03-15T14:30:00Z"`
- El cliente muestra en timezone local

## IDs
- UUID v4 generados en DB con `gen_random_uuid()`
- Nunca exponer IDs numéricos secuenciales al cliente
