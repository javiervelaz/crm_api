/**
 * Middleware de autorización por permisos (con soporte AND / OR)
 *
 * Ejemplos de uso:
 *   // Requiere uno de los permisos (modo OR, por defecto)
 *   authorizePermission('usuarios', ['ver_lista', 'ver_clientes'])
 *
 *   // Requiere ambos permisos (modo AND)
 *   authorizePermission('usuarios', ['editar_usuario', 'ver_lista'], 'AND')
 */

const authorizePermission = (moduleCode, permissionCodes, mode = 'OR') => {
    return (req, res, next) => {
      const userPermissions = req.user.permissions || {};
      console.log("permisos: ", userPermissions);
      const modulePermissions = userPermissions[moduleCode] || [];
      const globalPermissions = userPermissions._global || [];
  
      const requiredPermissions = Array.isArray(permissionCodes)
        ? permissionCodes
        : [permissionCodes];
  
      // Función para verificar si el usuario tiene un permiso específico
      const has = (perm) =>
        modulePermissions.includes(perm) || globalPermissions.includes(perm);
  
      let hasPermission = false;
  
      if (mode.toUpperCase() === 'AND') {
        // Debe tener TODOS los permisos requeridos
        hasPermission = requiredPermissions.every(has);
      } else {
        // Basta con tener UNO (modo OR por defecto)
        hasPermission = requiredPermissions.some(has);
      }
  
      if (!hasPermission) {
        const modeText =
          mode.toUpperCase() === 'AND'
            ? 'todos los siguientes permisos'
            : 'al menos uno de los siguientes permisos';
  
        return res.status(403).json({
          error: `Acción no permitida. Se requiere ${modeText}: [${requiredPermissions.join(
            ', '
          )}] en el módulo '${moduleCode}'.`,
        });
      }
  
      next();
    };
  };
  
  module.exports = { authorizePermission };
  