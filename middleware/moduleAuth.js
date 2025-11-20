const authorizeModule = (requiredModule) => (req, res, next) => {
    const userModules = req.user?.modules || [];
    console.log("user mod", req.user);
    console.log("req mod", requiredModule);
    if (!userModules.includes(requiredModule)) {
      return res.status(403).json({ error: 'No tiene acceso a este módulo44' });
    }
    next();
  };
  
  module.exports = { authorizeModule };
  