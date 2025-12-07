const jwt = require('jsonwebtoken');

const authenticateJWT = (req, res, next) => {
  const token = req.header('Authorization')?.split(' ')[1];
  if (!token) {
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid token' });
  }
};

const authorizeRole = (roles) => (req, res, next) => {
  // Extraer los id_rol de req.user.role
  const userRoles = req.user.role.map((role) => role);
  // Verificar si al menos un id_rol del usuario está incluido en roles
  const hasPermission = roles.some((requiredRole) => userRoles.includes(requiredRole));
  if (!hasPermission) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  next();
};



module.exports = { authenticateJWT, authorizeRole };
