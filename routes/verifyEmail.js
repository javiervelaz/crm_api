// routes/verifyEmail.js
const express = require('express');
const router = express.Router();
const pool = require('../pool');

router.get('/:token', async (req, res) => {
  const { token } = req.params;

  if (!/^[a-f0-9]{64}$/.test(token)) {
    return res.status(400).json({ error: 'Token inválido', code: 'INVALID_TOKEN' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT cliente_id, email FROM email_verification
        WHERE token = $1 AND used_at IS NULL AND expires_at > now()
          FOR UPDATE`,
      [token]
    );

    if (!rows[0]) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'El enlace expiró o ya fue usado', code: 'TOKEN_EXPIRED' });
    }

    await client.query(`UPDATE email_verification SET used_at = now() WHERE token = $1`, [token]);
    await client.query(
      `UPDATE cliente SET email_verificado_at = now() WHERE id = $1`,
      [rows[0].cliente_id]
    );

    await client.query('COMMIT');
    res.json({ ok: true, email: rows[0].email });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[verifyEmail]', err);
    res.status(500).json({ error: 'Error verificando el email' });
  } finally {
    client.release();
  }
});

module.exports = router;