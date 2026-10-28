const express = require('express');
const router = express.Router();
const pool = require('../pool');
const { authenticateCron } = require('../middleware/cronAuth');

// Vercel Cron (vercel.json, 03:00 UTC = 00:00 en Argentina) manda
// Authorization: Bearer <CRON_SECRET>.
router.use(authenticateCron);

router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      UPDATE cliente
      SET tier_id = (
        SELECT id FROM tier WHERE code = 'FREE' LIMIT 1
      ),
      tier_expiration_date = NULL,
      updated_at = NOW()
      WHERE tier_expiration_date IS NOT NULL
      -- vence al terminar el día en la zona del comercio, no a las 21:00 de Argentina
      AND tier_expiration_date < (now() AT TIME ZONE timezone)::date
    `);

    console.log(`Planes vencidos degradados: ${result.rowCount}`);
    res.status(200).json({ degraded: result.rowCount });
  } catch (err) {
    console.error('Error al ejecutar expiración de planes:', err);
    res.status(500).json({ error: 'Error expirando planes' });
  }
});

module.exports = router;
