// crm_api/routes/clientePlan.js
const express = require('express');
const router = express.Router();
const { registerTenantGuards } = require('../middleware/tenantMiddleware');
registerTenantGuards(router);
const { authenticateJWT } = require('../middleware/authMiddleware');
const { getClienteTierAndFeatures } = require('../services/cliente/planService');
const { getUso } = require('../services/cliente/usoPlanService');

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

// Uso de los límites numéricos del plan (pedidos del mes, productos, stock). Va aparte
// de /mi-plan porque ése lo llama el header en cada página y no debe pagar los COUNT.
router.get('/uso', authenticateJWT, async (req, res) => {
  try {
    const user = req.user;
    if (!user || !user.cliente_id) {
      return res.status(403).json({ error: 'Cliente no encontrado en el token' });
    }

    const { tierCode, tierNombre, features } = await getClienteTierAndFeatures(user.cliente_id);
    const uso = await getUso(user.cliente_id, features);
    res.json({ tierCode, tierNombre, uso });
  } catch (err) {
    console.error('Error en /api/cliente-plan/uso:', err);
    res.status(500).json({ error: 'Error obteniendo el uso del plan' });
  }
});

module.exports = router;
