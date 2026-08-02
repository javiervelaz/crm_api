// controllers/authController.js
const userService = require('../services/user/userService');
const { issueToken, TTL } = require('../services/auth/tokenService');

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña son obligatorios' });
    }

    const user = await userService.authenticate(String(email).trim().toLowerCase(), password);

    // authenticate puede devolver undefined (usuario inexistente) o { error }
    if (!user || user.error) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    res.json({ token: issueToken(user), expiresIn: TTL });
  } catch (err) {
    console.error('[login]', err);
    res.status(500).json({ error: 'Error al iniciar sesión' });
  }
};

module.exports = { login };