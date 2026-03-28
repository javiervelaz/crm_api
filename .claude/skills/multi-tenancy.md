# Skill: Multi-tenancy — Counter CRM

Counter CRM es un SaaS multi-tenant. Cada tenant es un cliente del CRM (una empresa/negocio). El aislamiento de datos es una propiedad de seguridad crítica — un tenant NUNCA puede ver ni modificar datos de otro.

## Cómo se identifica el tenant

El `tenant_id` siempre viene del JWT del usuario autenticado:

```js
// src/middleware/auth.js
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return next(new AppError('Token requerido', 401));

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = {
      userId: decoded.sub,
      tenantId: decoded.tenant_id, // ← siempre presente
      role: decoded.role,
    };
    next();
  } catch (err) {
    next(new AppError('Token inválido', 401));
  }
};
```

## Regla de oro en queries SQL

**Toda query que accede a datos de negocio DEBE incluir `tenant_id` en el WHERE:**

```js
// ✅ Correcto
const getContacto = async (client, tenantId, id) => {
  const { rows } = await client.query(
    'SELECT * FROM contactos WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
    [id, tenantId]
  );
  return rows[0] || null;
};

// ❌ NUNCA — permite acceso cross-tenant
const getContacto = async (client, id) => {
  const { rows } = await client.query('SELECT * FROM contactos WHERE id = $1', [id]);
  return rows[0];
};
```

## RLS en Neon (segunda línea de defensa)

```sql
-- Al crear cualquier tabla con datos de tenant:
ALTER TABLE contactos ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON contactos
  USING (tenant_id = current_setting('app.current_tenant_id')::UUID);
```

```js
// Setear el contexto antes de queries cuando RLS está activo
const setTenantContext = async (client, tenantId) => {
  await client.query(`SET app.current_tenant_id = '${tenantId}'`);
};
```

## Schema: qué tablas necesitan tenant_id

| Tabla | ¿tenant_id? | Notas |
|-------|-------------|-------|
| `tenants` | ❌ | Es la tabla raíz |
| `users` | ✅ | Un user pertenece a un tenant |
| `contactos` | ✅ | Datos del negocio |
| `whatsapp_accounts` | ✅ | Por tenant |
| `mensajes` | ✅ | Siempre |
| `planes` | ❌ | Global, referenciado por tenants |

## Validación en service (tercera línea)

```js
// Después de buscar un recurso, verificar que pertenece al tenant
const getFactura = async (tenantId, facturaId) => {
  const factura = await db.getById(client, tenantId, facturaId);
  // db.getById ya filtra por tenant_id — si no encuentra, devuelve null
  if (!factura) {
    throw new AppError('Factura no encontrada', 404);
    // No decir "no tenés permiso" — no revelar que existe para otro tenant
  }
  return factura;
};
```

## Datos compartidos vs datos de tenant

```js
// Datos de tenant → siempre con tenantId
await service.getContactos(req.user.tenantId);

// Datos globales (ej: lista de países, planes disponibles) → sin tenantId
await service.getPlanes(); // tabla global, no tiene tenant_id
```

## Tests de aislamiento (obligatorios)

```js
it('tenant A no puede acceder a recursos de tenant B', async () => {
  const recursoDeB = await crearRecurso(TENANT_B);

  await expect(
    service.getById(TENANT_A, recursoDeB.id)
  ).rejects.toThrow(AppError); // 404, no 403

  // Tampoco puede modificarlo
  await expect(
    service.update(TENANT_A, recursoDeB.id, { nombre: 'hack' })
  ).rejects.toThrow(AppError);
});
```
