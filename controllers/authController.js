// controllers/authController.js
const userService = require('../services/user/userService');
const { issueToken, TTL } = require('../services/auth/tokenService');
const { motivoRechazo } = require('../services/verificacion/estados');

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

    // ─── Gate de activación ───────────────────────────────────────────────
    // Va DESPUÉS de validar la contraseña, nunca antes. Si rechazáramos por
    // estado con la clave equivocada, cualquiera podría probar direcciones y
    // distinguir "no existe" (401) de "existe pero no verificó" (403). El
    // login pasaría a ser un enumerador de clientes.
    //
    // El body tampoco devuelve el email: el front ya lo tiene en el input.
    const rechazo = motivoRechazo(user.cliente_estado);
    if (rechazo) {
      return res.status(403).json(rechazo);
    }

    res.json({ token: issueToken(user), expiresIn: TTL });
  } catch (err) {
    console.error('[login]', err);
    res.status(500).json({ error: 'Error al iniciar sesión' });
  }
};

module.exports = { login };
