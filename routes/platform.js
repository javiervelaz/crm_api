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
            c.tier_expiration_date, c.created_at, t.code AS tier_code, c.rubro_codigo
       FROM cliente c
       LEFT JOIN tier t ON t.id = c.tier_id
      ORDER BY c.created_at DESC
      LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  res.json(rows);
});

// ─── Módulos de un tenant ───────────────────────────────────────────────────
// Counter (no el tenant) es quien activa/desactiva módulos y ajusta su setup.
// El tenant ve el efecto en su próximo login: los módulos viajan en el JWT.

const parseClienteId = (raw) => {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
};

router.get('/clientes/:id/modulos', async (req, res, next) => {
  try {
    const clienteId = parseClienteId(req.params.id);
    if (!clienteId) return res.status(400).json({ error: 'id inválido', code: 'INVALID_PARAM' });

    const { rows } = await pool.query(
      `SELECT m.id, m.codigo, m.descripcion, m.status, m.config, m.deleted_at
         FROM modulo m
        WHERE m.cliente_id = $1
        ORDER BY m.id`,
      [clienteId]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.patch('/clientes/:id/modulos/:codigo', async (req, res, next) => {
  try {
    const clienteId = parseClienteId(req.params.id);
    if (!clienteId) return res.status(400).json({ error: 'id inválido', code: 'INVALID_PARAM' });

    const { status, config } = req.body || {};
    if (status === undefined && config === undefined) {
      return res.status(400).json({ error: 'Nada para actualizar: enviá status y/o config', code: 'EMPTY_PATCH' });
    }
    if (status !== undefined && typeof status !== 'boolean') {
      return res.status(400).json({ error: 'status debe ser booleano', code: 'INVALID_STATUS' });
    }
    if (config !== undefined && (config === null || typeof config !== 'object' || Array.isArray(config))) {
      return res.status(400).json({ error: 'config debe ser un objeto JSON', code: 'INVALID_CONFIG' });
    }

    const { rows } = await pool.query(
      `UPDATE modulo
          SET status     = COALESCE($3, status),
              config     = COALESCE($4::jsonb, config),
              updated_at = CURRENT_TIMESTAMP
        WHERE cliente_id = $1 AND codigo = $2 AND deleted_at IS NULL
        RETURNING id, codigo, descripcion, status, config`,
      [clienteId, req.params.codigo, status ?? null, config === undefined ? null : JSON.stringify(config)]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'El tenant no tiene ese módulo', code: 'MODULO_NO_ENCONTRADO' });
    }

    console.info(
      `[PLATFORM] modulo ${req.params.codigo} de cliente ${clienteId} → ` +
      `status=${rows[0].status} config=${config === undefined ? '(sin cambios)' : 'actualizada'}`
    );
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

module.exports = router;