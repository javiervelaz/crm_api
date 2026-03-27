# Code Review - CRM API

**Fecha:** 2026-03-27
**Rama revisada:** develop
**Archivos revisados:** node.js, db.js, pool.js, 8 routes, 8 controllers, 7 middlewares, package.json

---

## Resumen Ejecutivo

**Rating general: 4.5 / 10**

La API tiene una estructura funcional con una buena separacion en capas (routes -> controllers -> services) y un sistema de autorizacion por modulos/permisos bien pensado. Sin embargo, presenta **vulnerabilidades de seguridad criticas**, endpoints completamente desprotegidos, codigo muerto con bugs, credenciales expuestas en el repositorio y falta de validacion de inputs en la mayoria de los endpoints.

---

## Hallazgos Criticos (Seguridad)

### 1. CRITICO: Credenciales de Google OAuth expuestas en el repositorio

**Archivo:** `credentials.json`

El archivo contiene el `client_id` y `project_id` de Google OAuth y **no esta incluido en `.gitignore`**. El `.gitignore` solo excluye `node_modules` y `.env`. Este archivo esta versionado y visible para cualquiera con acceso al repositorio.

**Impacto:** Exposicion de credenciales de servicio. Si el repositorio es publico o se filtra, las credenciales pueden ser abusadas.

**Recomendacion:** Agregar `credentials.json` a `.gitignore`, rotar las credenciales y mover los valores sensibles a variables de entorno.

---

### 2. CRITICO: Secret de JWT hardcodeado como fallback

**Archivo:** `middleware/handoffAuth.js:3`, `controllers/handoffController.js:4`

```javascript
const HANDOFF_JWT_SECRET = process.env.HANDOFF_JWT_SECRET || 'change-me';
```

Si la variable de entorno no esta definida, se usa `'change-me'` como secret. Cualquier atacante podria firmar tokens validos con este valor predecible.

**Impacto:** Suplantacion de identidad completa en el sistema de handoff si la variable de entorno no esta configurada en produccion.

**Recomendacion:** Eliminar el fallback. Si la variable no existe, la aplicacion debe fallar al iniciar, no operar con un secret inseguro.

---

### 3. CRITICO: Endpoints sin autenticacion ni autorizacion

Multiples endpoints criticos no tienen ningun middleware de autenticacion:

| Archivo | Endpoint | Riesgo |
|---------|----------|--------|
| `routes/cliente.js` | `POST /`, `PUT /:id`, `DELETE /:id`, `GET /list/` | CRUD completo de clientes sin auth |
| `routes/rol.js` | `POST /`, `PUT /:id`, `DELETE /:id` | Crear/modificar/borrar roles sin auth |
| `routes/registroDiario.js` | `POST /`, `PUT /:id`, `DELETE /:id` | Manipulacion de registros financieros sin auth |
| `routes/operacionesDiarias.js` | `POST /abrir-caja`, `POST /registrar-salida-caja`, `PUT /cierre-caja`, `POST /check-caja` | Operaciones de caja sin auth |
| `routes/operacionesDiarias.js` | `POST /crear-pedido-whatsaap` | Creacion de pedidos sin auth NI limite |
| `routes/handoff.js` | `POST /sign` | Generacion de tokens JWT sin auth |
| `routes/producto.js` | `GET /:id/images`, `DELETE /images/:imgId` | Listar y borrar imagenes sin auth |
| `routes/users.js` | `GET /type/:id`, `GET /tipo`, `GET /rol/:id/:cliente_id` | Informacion de usuarios sin auth |

**Impacto:** Cualquier persona puede crear clientes, modificar roles, manipular registros financieros, generar tokens de handoff y borrar imagenes de productos sin ninguna credencial.

**Recomendacion:** Agregar `authenticateJWT` y los middlewares de autorizacion correspondientes a todos estos endpoints.

---

### 4. CRITICO: Endpoint de WhatsApp sin autenticacion ni limites

**Archivo:** `routes/operacionesDiarias.js:13`

```javascript
router.post('/crear-pedido-whatsaap', operacionesDiariasController.crearPedido);
```

Mientras que `crear-pedido` tiene `authenticateJWT` y `requireLimit('maxPedidosMensuales')`, la version de WhatsApp no tiene ninguna proteccion. Un atacante puede crear pedidos ilimitados sin autenticacion.

**Impacto:** Abuso del sistema de pedidos, datos basura, potencial denegacion de servicio.

---

### 5. CRITICO: Log de tokens JWT en produccion

**Archivo:** `middleware/authMiddleware.js:5`

```javascript
console.log('[AUTH] Token:', token);
```

El token JWT completo se imprime en los logs del servidor en cada request autenticado. Si los logs son accesibles (CloudWatch, archivos de log, servicios de monitoreo), los tokens pueden ser robados.

**Impacto:** Robo de sesion a traves de logs.

**Recomendacion:** Eliminar este `console.log` o, como maximo, loguear solo los ultimos 8 caracteres para debugging.

---

### 6. CRITICO: Falta de validacion de inputs en todos los controllers

Ningun controller valida el tipo, formato o rango de los datos recibidos. A pesar de que `express-validator` esta instalado como dependencia, **no se usa en ningun endpoint**.

Ejemplos:
- `authController.js`: no valida que `email` y `password` existan antes de pasarlos al servicio
- `userController.js`: no valida formatos de email, longitud de nombre, tipo de `user_type_id`
- `operacionesDiariasController.js`: acepta montos sin validar que sean numeros positivos
- `productoController.js`: no valida `precio_unitario` como numero positivo
- `billingWebhook.js`: no valida la firma/autenticidad del webhook de MercadoPago

**Impacto:** Datos corruptos en la base de datos, errores inesperados, potenciales ataques de inyeccion si los servicios construyen queries dinamicamente.

**Recomendacion:** Implementar validacion con `express-validator` en todas las rutas. Como minimo: campos requeridos, tipos de datos, y rangos numericos.

---

### 7. CRITICO: SSL deshabilitado en la conexion a PostgreSQL

**Archivo:** `pool.js:6`

```javascript
ssl: { rejectUnauthorized: false }
```

La verificacion del certificado SSL esta deshabilitada. Esto permite ataques Man-in-the-Middle entre la aplicacion y la base de datos.

**Impacto:** Un atacante en la red podria interceptar todas las queries y respuestas de la base de datos, incluyendo datos de usuarios y credenciales.

**Recomendacion:** Configurar el certificado CA del servidor de base de datos y establecer `rejectUnauthorized: true` en produccion.

---

### 8. CRITICO: Webhook de MercadoPago sin verificacion de firma

**Archivo:** `routes/billingWebhook.js`

El webhook acepta cualquier POST sin verificar que provenga realmente de MercadoPago. No se valida el header `x-signature` ni el `x-request-id` que MercadoPago envia.

**Impacto:** Un atacante puede enviar webhooks falsos para activar planes premium sin pagar, o modificar el `tier_id` de cualquier cliente.

**Recomendacion:** Implementar la verificacion de firma de MercadoPago usando HMAC SHA-256 como indica su documentacion.

---

### 9. IMPORTANTE: Token JWT con demasiada informacion

**Archivo:** `controllers/authController.js:10-18`

El JWT incluye `role`, `modules`, `permissions`, `sucursal`, `username` y `cliente_id`. Esto tiene dos problemas:

1. **Tamano del token:** Si un usuario tiene muchos permisos, el token crece significativamente.
2. **Desincronizacion:** Si se cambian los permisos de un usuario, su token sigue teniendo los permisos viejos hasta que expire (1h).

**Recomendacion:** Incluir solo `userId` y `cliente_id` en el token. Consultar permisos desde la base de datos (con cache) en cada request.

---

### 10. IMPORTANTE: Variable global no declarada

**Archivo:** `controllers/handoffController.js:48`

```javascript
expiresIn = payload.exp - now;
```

`expiresIn` no esta declarada con `let`/`const`, creando una variable global implicita. En un entorno concurrente, esto puede causar race conditions donde el valor de un request sobreescribe el de otro.

**Impacto:** Respuestas incorrectas con datos de otros usuarios, potencial fuga de informacion.

---

## Hallazgos Importantes (Calidad / Mantenibilidad)

### 11. Codigo muerto con bugs en `db.js`

**Archivo:** `db.js`

Este archivo parece ser una version inicial que ya no se usa (los controllers usan services, no `db.js` directamente). Contiene bugs evidentes:

- Linea 43: columna `descripcionl` (typo, deberia ser `descripcion`)
- Linea 62: `updateRol` referencia variables `nombre, apellido, dni, email` que no existen en ese scope
- Linea 60-61: SQL hace UPDATE a tabla `user` en vez de tabla `rol`
- Linea 2: importa `express` sin usarlo

**Recomendacion:** Eliminar este archivo si no se usa, o corregir los bugs si todavia tiene utilidad.

---

### 12. Duplicacion de rutas en `node.js`

**Archivo:** `node.js:14,28`

```javascript
const authRoutes = require("./routes/auth");   // linea 14
const authToken = require("./routes/auth");     // linea 28, misma ruta
```

Se monta dos veces:
- `app.use("/api/auth", authRoutes);` (linea 43)
- `app.use("/api/token", authToken);` (linea 57)

El mismo archivo `routes/auth.js` se monta en dos paths diferentes. El endpoint de login queda accesible en `/api/auth/login` y `/api/token/login`.

**Recomendacion:** Eliminar una de las dos y dejar solo un path para login.

---

### 13. Patron inconsistente en controllers

Los controllers mezclan dos estilos:
- **Con service layer:** `userController.js`, `productoController.js`, `rolController.js` delegan a servicios
- **Sin service layer:** `registroDiarioController.js` ejecuta queries directamente con `pool.query()`
- **Inline en route:** `routes/billing.js` tiene toda la logica del checkout directamente en el archivo de rutas

**Recomendacion:** Estandarizar el patron route -> controller -> service en todos los endpoints.

---

### 14. Variables no desestructuradas en `pedidoController.js`

**Archivo:** `controllers/pedidoController.js:5-6`

```javascript
const { registro_diario_id, monto_total, usuario_id, sucursal_id, productos } = req.body;
// ...
medio_pago_id,  // <-- No se desestructura, undefined
observacion      // <-- No se desestructura, undefined
```

`medio_pago_id` y `observacion` se pasan al servicio pero nunca se extraen de `req.body`. Siempre seran `undefined`.

**Impacto:** Los pedidos se crean sin medio de pago ni observacion, aun cuando el frontend los envie.

---

### 15. Nombres inconsistentes

- **Archivos:** `reportesContoller.js` (typo: "Contoller" en vez de "Controller")
- **Variables:** `tipoPoductoRoutes` (typo: "Podcuto" en vez de "Producto") en `node.js:24`
- **Endpoints:** Mix de espanol e ingles (`/crear-pedido`, `/list`, `/delete`)
- **Codigos HTTP:** `checkCajaAbierta` devuelve 201 (Created) para una consulta GET que deberia devolver 200

---

### 16. Console.log de debugging en produccion

Multiples archivos tienen `console.log` de debugging que no deberian estar en produccion:

- `middleware/authMiddleware.js:5` - Log del token completo
- `middleware/authMiddleware.js:8` - Log "Falta token"
- `middleware/authMiddleware.js:14` - Log del token decodificado completo
- `controllers/handoffController.js:34` - Log del token
- `controllers/operacionesDiariasController.js:103` - Log del body
- `controllers/operacionesDiariasController.js:126` - Log del body
- `routes/billing.js:11` - Log del user completo
- `routes/billingWebhook.js:20` - Log del webhook completo

**Recomendacion:** Reemplazar con un logger estructurado (winston, pino) con niveles de log configurables por entorno.

---

### 17. Falta middleware global de errores

No existe un error handler global en Express. Si un controller llama a `next(error)` (como en `productoController.js:79`), Express devuelve el stack trace completo al cliente.

**Recomendacion:** Agregar un middleware de error al final de `node.js`:

```javascript
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: 'Internal server error' });
});
```

---

### 18. Sin rate limiting

La API no tiene ningun rate limiter. El endpoint de login (`POST /api/auth/login`) es especialmente vulnerable a ataques de fuerza bruta.

**Recomendacion:** Agregar `express-rate-limit` como minimo en el endpoint de login y en los endpoints publicos.

---

### 19. CORS demasiado permisivo

**Archivo:** `node.js:9`

```javascript
app.use(cors());
```

CORS esta configurado para aceptar requests de cualquier origen. En produccion deberia estar limitado a los dominios del frontend.

---

### 20. Ruta `/saas.js` con path incorrecto

**Archivo:** `routes/saas.js:3`

```javascript
const pool = require('../../pool');
```

El `require` apunta a `../../pool` (dos niveles arriba), cuando deberia ser `../pool` (un nivel arriba, ya que saas.js esta en routes/).

**Impacto:** Este archivo probablemente falla con un error de modulo no encontrado al ejecutarse.

---

## Buenas Practicas Encontradas

1. **Separacion en capas (routes/controllers/services):** La mayoria del codigo sigue este patron, facilitando la mantenibilidad.

2. **Uso de parametros preparados ($1, $2...):** Las queries SQL usan parametros posicionales de `pg`, previniendo inyeccion SQL en los endpoints que pasan por services.

3. **Sistema de permisos por modulo bien disenado:** El middleware `permissionMiddleware.js` con soporte AND/OR es flexible y bien implementado.

4. **Feature flags por tier/plan:** El middleware `featureMiddleware.js` y `limitMiddleware.js` implementan un sistema de restriccion por plan de pago que es limpio y reutilizable.

5. **Multer con limite de tamano:** El upload de archivos limita a 5MB y usa memory storage, evitando que archivos grandes llenen el disco.

6. **Uso de bcrypt para passwords:** En `routes/saas.js` se hashea la password correctamente antes de guardarla.

7. **JWT con expiracion:** Los tokens tienen expiracion de 1 hora.

8. **Handoff JWT con audience e issuer:** El token de handoff valida `audience` e `issuer`, lo cual es una buena practica de seguridad JWT.

---

## Recomendaciones Priorizadas

### Prioridad 1 - Seguridad (hacer inmediatamente)

1. **Agregar `credentials.json` al `.gitignore`** y rotar las credenciales de Google OAuth
2. **Eliminar el fallback `'change-me'`** del HANDOFF_JWT_SECRET
3. **Agregar `authenticateJWT`** a todos los endpoints desprotegidos (clientes, roles, registro diario, operaciones de caja, handoff/sign, imagenes)
4. **Eliminar los `console.log` de tokens** en `authMiddleware.js`
5. **Verificar la firma del webhook** de MercadoPago
6. **Agregar `express-rate-limit`** al endpoint de login

### Prioridad 2 - Bugs funcionales (hacer esta semana)

7. **Corregir la variable global `expiresIn`** en `handoffController.js` (agregar `let`)
8. **Corregir la desestructuracion** en `pedidoController.js` (agregar `medio_pago_id` y `observacion`)
9. **Corregir el path** en `routes/saas.js` (`../../pool` -> `../pool`)
10. **Eliminar o corregir `db.js`** que tiene multiples bugs

### Prioridad 3 - Calidad (hacer este sprint)

11. **Implementar validacion de inputs** con `express-validator` en todas las rutas
12. **Agregar error handler global** en Express
13. **Configurar CORS** con origenes especificos por entorno
14. **Reemplazar `console.log`** con un logger estructurado
15. **Eliminar la ruta duplicada** `/api/token`

### Prioridad 4 - Mejora continua

16. **Estandarizar el patron** route -> controller -> service en todos los endpoints
17. **Unificar idioma** en nombres de endpoints y variables (elegir espanol o ingles)
18. **Reducir el payload del JWT** (solo userId y cliente_id, consultar permisos en middleware)
19. **Configurar SSL correcto** para PostgreSQL en produccion
20. **Agregar tests** para los middlewares de autorizacion

---

*Reporte generado como parte del code review del proyecto CRM API.*
