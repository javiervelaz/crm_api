// crm_api/routes/tiers.js
const express = require('express');
const router = express.Router();
const pool = require('../pool');

/**
 * GET /api/tiers
 * Devuelve todos los planes activos (FREE, BASIC, PREMIUM)
 */
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        id,
        code,
        nombre_publico,
        descripcion,
        precio_mensual,
        es_activo
      FROM tier
      WHERE es_activo = true
      ORDER BY id
      `
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Error en GET /api/tiers:', err);
    res.status(500).json({ error: 'Error obteniendo los planes' });
  }
});

module.exports = router;
