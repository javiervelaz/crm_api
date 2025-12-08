require('dotenv').config();
const { MercadoPagoConfig, PreApproval } = require('mercadopago');
const pool = require('../pool');

// MP client
const mpClient = new MercadoPagoConfig({
  accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN
});
const preapproval = new PreApproval(mpClient);

async function checkSubscriptions() {
  console.log('Iniciando verificación de suscripciones...');

  const result = await pool.query(`
    SELECT bs.id, bs.mp_preapproval_id, bs.cliente_id
    FROM billing_subscription bs
    WHERE bs.status = 'active'
  `);

  for (const row of result.rows) {
    const { mp_preapproval_id, cliente_id } = row;

    try {
      const mpSub = await preapproval.get({ id: mp_preapproval_id });
      const status = mpSub.status || mpSub.body?.status;

      if (status !== 'authorized') {
        console.log(`Desactivando suscripción de cliente ${cliente_id} (estado actual: ${status})`);

        await pool.query(`
          UPDATE billing_subscription
          SET status = 'inactive'
          WHERE mp_preapproval_id = $1
        `, [mp_preapproval_id]);

        await pool.query(`
          UPDATE cliente
          SET tier_id = NULL, updated_at = NOW()
          WHERE id = $1
        `, [cliente_id]);
      }

    } catch (err) {
      console.error(`Error verificando ${mp_preapproval_id}:`, err.message || err);
    }
  }

  console.log('Verificación de suscripciones finalizada.');
}

checkSubscriptions();
