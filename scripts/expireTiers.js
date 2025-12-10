// scripts/expireTiers.js
const pool = require('../pool');

async function expireTiers() {
  try {
    const result = await pool.query(`
      UPDATE cliente
      SET tier_id = (
        SELECT id FROM tier WHERE code = 'FREE' LIMIT 1
      ),
      tier_expiration_date = NULL,
      updated_at = NOW()
      WHERE tier_expiration_date IS NOT NULL
      AND tier_expiration_date < CURRENT_DATE
    `);

    console.log(`Planes vencidos degradados: ${result.rowCount}`);
  } catch (err) {
    console.error('Error al ejecutar expiración de planes:', err);
  } finally {
    pool.end();
  }
}

expireTiers();
