// routes/platform.js
const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const pool = require('../pool');

const PLATFORM_TOKEN = process.env.PLATFORM_ADMIN_TOKEN;
if (!PLATFORM_TOKEN || PLATFORM_TOKEN.length < 32) {
  throw new Error('PLATFORM_ADMIN_TOKEN es obligatorio (>= 32 chars)');
}

router.use((req, res, next) => {
  const h = req.headers.authorization || '';
  const provided = Buffer.from(h.startsWith('Bearer ') ? h.slice(7) : '');
  const expected = Buffer.from(PLATFORM_TOKEN);
  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    console.warn(`[PLATFORM] acceso no autorizado desde ${req.ip} → ${req.originalUrl}`);
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

// Listado de tenants: sólo con token de plataforma
router.get('/clientes', async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;
  const { rows } = await pool.query(
    `SELECT c.id, c.nombre, c.cuit, c.contacto_email, c.canal_alta,
            c.tier_expiration_date, c.created_at, t.code AS tier_code
       FROM cliente c
       LEFT JOIN tier t ON t.id = c.tier_id
      ORDER BY c.created_at DESC
      LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  res.json(rows);
});

module.exports = router;