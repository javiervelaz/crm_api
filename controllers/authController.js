const jwt = require('jsonwebtoken');
const userService = require('../services/user/userService');

const login = async (req, res) => {
  const { email, password } = req.body;
 const user = await userService.authenticate(email, password);
  if (user.error) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = jwt.sign(
    { 
      userId: user.id, 
      role: user.role, 
      modules: user.modules,
      permissions: user.permissions,
      sucursal:1, 
      username: user.name, 
      cliente_id: user.cliente_id 
    }, process.env.JWT_SECRET, { expiresIn: '1h' });
  res.json({ token });
  
};

module.exports = { login };
