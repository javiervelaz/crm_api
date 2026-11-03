const authorizeModule = (requiredModule) => (req, res, next) => {
    const userModules = req.user?.modules || [];
    if (!userModules.includes(requiredModule)) {
      return res.status(403).json({ error: 'No tiene acceso a este módulo', code: 'SIN_MODULO' });
    }
    next();
  };
  
  module.exports = { authorizeModule };
  