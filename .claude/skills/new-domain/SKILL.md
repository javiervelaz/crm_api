# new-domain

Genera todos los archivos necesarios para un nuevo dominio en el CRM siguiendo el patrón routes → controllers → services → model/db.js.

Invocá este skill cuando necesites crear un nuevo módulo o recurso en la API.

<skill>
El usuario quiere crear un nuevo dominio en el CRM API. Tu tarea es generar los 4 archivos completos y registrar la ruta en node.js.

## Paso 1 — Pedile la info necesaria si no la proporcionó

Si el usuario no especificó el nombre del dominio o los campos, preguntale:
- **Nombre del dominio** (ej: `proveedor`, `factura`, `turno`) — en singular, minúsculas
- **Campos principales** de la tabla (nombre, tipo)
- **Módulo de permisos** asociado (ej: `proveedores`) — generalmente el plural del dominio
- **¿Requiere límite de plan?** (ej: `maxProveedores`) — sí/no
- **¿Requiere feature flag?** (ej: `canUseProveedores`) — sí/no

Una vez que tengas los datos, generá los 4 archivos siguiendo estrictamente los patrones del proyecto.

## Patrones obligatorios

### model/<dominio>/db.js
- Importa `const pool = require('../../pool');`
- Todas las queries usan `$1, $2...` (nunca interpolación de strings)
- Todas las queries filtran por `cliente_id`
- UPDATE usa `COALESCE($n, campo)` para updates parciales
- DELETE devuelve `RETURNING *`
- Para operaciones multi-paso usar transacciones: `pool.connect()` + BEGIN/COMMIT/ROLLBACK + `client.release()` en `finally`
- Exportar todas las funciones al final con `module.exports = { ... }`

### services/<dominio>/<dominio>Service.js
- Importa el modelo: `const db = require('../../model/<dominio>/db');`
- Valida campos requeridos con `if (!campo) throw new Error('...')`
- La lógica de negocio va acá, no en el controller
- Exportar todas las funciones al final con `module.exports = { ... }`

### controllers/<dominio>Controller.js
- Importa el service: `const <dominio>Service = require('../services/<dominio>/<dominio>Service');`
- Cada handler es `async (req, res)` con try/catch
- Errores de validación → `res.status(400).json({ error: error.message })`
- No encontrado → `res.status(404).json({ error: '...' })`
- Error de servidor → `res.status(500).json({ error: error.message })`
- Éxito creación → `res.status(201).json(result)`
- Éxito lectura/update → `res.status(200).json(result)`
- Exportar todas las funciones al final con `module.exports = { ... }`

### routes/<dominio>.js
- Importa middlewares necesarios de `../middleware/authMiddleware`, `../middleware/moduleAuth`, `../middleware/permissionMiddleware`
- Si tiene límite: `const { requireLimit } = require('../middleware/limitMiddleware')`
- Si tiene feature: `const { requireFeature } = require('../middleware/featureMiddleware')`
- Orden estándar de middleware: `authenticateJWT` → `authorizeRole` (solo si admin) → `authorizeModule` → `authorizePermission` → `requireLimit`/`requireFeature`
- Códigos de permiso siguen el patrón: `<modulo>.<accion>` (ej: `proveedores.create`, `proveedores.list`, `proveedores.update`, `proveedores.delete`)
- Exportar con `module.exports = router;`

## Paso 2 — Generá los archivos

Creá los 4 archivos con el contenido completo y funcional.

## Paso 3 — Registrá la ruta en node.js

Leé el archivo `node.js`, encontrá el bloque donde se registran las rutas (las líneas con `app.use('/api/...')`), y agregá la nueva ruta siguiendo el mismo patrón:

```javascript
const <dominio>Routes = require('./routes/<dominio>');
// ...
app.use('/api/<dominio>s', <dominio>Routes);
```

Asegurate de agregar tanto el `require` como el `app.use` en los lugares correctos (no al final del archivo, sino junto a los demás requires y app.use respectivamente).

## Paso 4 — Confirmá al usuario

Mostrá un resumen de los archivos creados y los endpoints generados en formato tabla:

| Método | Endpoint | Descripción | Middleware |
|--------|----------|-------------|------------|
| GET | /api/<dominio>s/list/:cliente_id | Listar | JWT + módulo + permiso |
| GET | /api/<dominio>s/:id/:cliente_id | Obtener por ID | JWT + módulo + permiso |
| POST | /api/<dominio>s | Crear | JWT + módulo + permiso + (límite) |
| PUT | /api/<dominio>s/:id | Actualizar | JWT + módulo + permiso |
| DELETE | /api/<dominio>s/:id/:cliente_id | Eliminar | JWT + rol admin + módulo + permiso |
</skill>
