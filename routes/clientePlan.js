// crm_api/routes/clientePlan.js
const express = require('express');
const router = express.Router();
const { authenticateJWT } = require('../middleware/authMiddleware');
const { getClienteTierAndFeatures } = require('../services/cliente/planService');

router.get('/mi-plan', authenticateJWT, async (req, res) => {
  try {
    const user = req.user;
    if (!user || !user.cliente_id) {
      return res.status(403).json({ error: 'Cliente no encontrado en el token' });
    }

    const data = await getClienteTierAndFeatures(user.cliente_id);
    res.json(data);
  } catch (err) {
    console.error('Error en /api/cliente/mi-plan:', err);
    res.status(500).json({ error: 'Error obteniendo el plan del cliente' });
  }
});

module.exports = router;
