// routes/rubros.js
//
// Catálogo público de rubros activos. Lo consume el alta (selector de rubro)
// igual que /api/tiers consume el de planes. Sin datos de tenant.
const express = require('express');
const router = express.Router();
const pool = require('../pool');

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT codigo, nombre
         FROM rubro
        WHERE activo = true
        ORDER BY nombre`
    );
    res.json(rows);
  } catch (err) {
    console.error('Error en GET /api/rubros:', err);
    next(err);
  }
});

module.exports = router;
