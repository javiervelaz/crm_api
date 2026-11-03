// middleware/acceso.js — quién puede hacer qué, a partir del JWT.
//
//   requierePermiso('operaciones.list', 'cerrarcaja.list')
//     pasa si el usuario tiene AL MENOS UNO: el módulo (prefijo del código)
//     en `modules` y el permiso en `permissions[modulo]` (o en `_global`).
//     Junta en un paso lo que authorizeModule + authorizePermission hacen por
//     separado, y permite rutas que sirven a más de una pantalla (ej. los
//     montos del día los usa Pedidos y también Cierre de caja).
//
//   soloAdmin
//     configuración del comercio (roles, permisos, registros de caja a mano).
//
// Admin: alcanza con que tenga el MÓDULO. Hay comercios viejos cuyo admin no
// tiene los permisos .list/.create (anteriores a permiso_accion); exigirlos
// los dejaba afuera de su propio comercio. Si Counter le saca el módulo al
// comercio, el admin igual queda afuera.
//
// El admin se reconoce por el tipo de usuario (ADMIN, viaja en el JWT) y no
// sólo por el nombre del rol, que es editable. Se acepta también el rol
// "admin" para los tokens emitidos antes de que existiera `tipo`.

const esAdmin = (user) => user?.tipo === 'ADMIN' || (user?.role || []).includes('admin');

const tienePermiso = (user, codigo) => {
  const [modulo] = String(codigo).split('.');
  if (!(user?.modules || []).includes(modulo)) return false;
  if (esAdmin(user)) return true;
  const p = user?.permissions || {};
  return (p[modulo] || []).includes(codigo) || (p._global || []).includes(codigo);
};

const requierePermiso = (...codigos) => {
  if (!codigos.length || codigos.some((c) => !/^[a-z-]+\.(list|create|update|delete)$/.test(c))) {
    throw new Error(`requierePermiso: códigos inválidos (${codigos.join(', ')})`);
  }
  return (req, res, next) => {
    if (codigos.some((c) => tienePermiso(req.user, c))) return next();
    return res.status(403).json({
      error: 'Tu usuario no tiene permiso para esta acción. Pedíselo al dueño del comercio.',
      code: 'SIN_PERMISO',
    });
  };
};

const soloAdmin = (req, res, next) => {
  if (esAdmin(req.user)) return next();
  return res.status(403).json({ error: 'Esto lo puede hacer sólo el administrador del comercio.', code: 'SOLO_ADMIN' });
};

module.exports = { requierePermiso, soloAdmin, esAdmin, tienePermiso };
