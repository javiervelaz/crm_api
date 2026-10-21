// crm_api/routes/tiers.js
const express = require('express');
const router = express.Router();
const planService = require('../services/cliente/planService');
const { registerTenantGuards } = require('../middleware/tenantMiddleware');
registerTenantGuards(router);

const RUBRO_RE = /^[a-z][a-z0-9_]{1,29}$/;

/**
 * GET /api/tiers?rubro=gastronomia
 * Planes activos con el precio, la duración, la disponibilidad y las
 * features de ESE rubro (rubro_tier). Sin rubro → gastronomía (histórico).
 * `disponible: false` = el plan existe pero todavía no se puede contratar.
 */
router.get('/', async (req, res) => {
  const rubro = String(req.query.rubro || 'gastronomia').trim().toLowerCase();
  if (!RUBRO_RE.test(rubro)) return res.status(400).json({ error: 'Rubro inválido', code: 'RUBRO_INVALIDO' });
  try {
    const ofertas = await planService.listarOfertas(rubro);
    res.json(ofertas.map((o) => ({
      id: o.id,
      code: o.code,
      nombre_publico: o.nombre_publico,
      descripcion: o.descripcion,
      precio_mensual: o.precio_mensual,
      es_activo: o.es_activo,
      es_personalizado: o.es_personalizado,
      duracion_meses: o.duracion_meses,
      rubro_codigo: o.rubro_codigo,
      disponible: o.disponible,
      features: o.features,
    })));
  } catch (err) {
    console.error('Error en GET /api/tiers:', err);
    res.status(500).json({ error: 'Error obteniendo los planes' });
  }
});

module.exports = router;
