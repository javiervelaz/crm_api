require('dotenv').config();

async function testWithOriginalToken() {
  // Usar el token original de crmpagos
  const token = 'TEST-6105554811696395-120717-31b14cf68231c29854cb4254e3efc654-1301492';

  console.log('Usando token de crmpagos (seller real)');

  // Crear preference con email real (no test user)
  console.log('\n--- Creando preference ---');
  const prefRes = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: [{ title: 'Plan BASIC', quantity: 1, currency_id: 'ARS', unit_price: 200 }],
      external_reference: 'cliente-25',
      payer: { email: 'comprador@test.com' },
      back_urls: {
        success: 'https://google.com?status=ok',
        failure: 'https://google.com?status=fail',
      },
      auto_return: 'approved',
      notification_url: process.env.MERCADOPAGO_WEBHOOK_URL || 'https://your-ngrok.ngrok-free.app/api/billing/webhook',
    }),
  });
  const pref = await prefRes.json();
  console.log('Status:', prefRes.status);

  // Probar pago directo via API (sin checkout UI)
  console.log('\n--- Creando card token ---');
  const ctRes = await fetch('https://api.mercadopago.com/v1/card_tokens', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      card_number: '5031755734530604',
      expiration_month: 11, expiration_year: 2028,
      security_code: '123',
      cardholder: { name: 'APRO', identification: { type: 'DNI', number: '12345678' } },
    }),
  });
  const ct = await ctRes.json();
  console.log('Card token:', ct.id ? 'OK' : 'FAIL', '| live_mode:', ct.live_mode);

  console.log('\n--- Procesando pago directo ---');
  const payRes = await fetch('https://api.mercadopago.com/v1/payments', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Idempotency-Key': `test-${Date.now()}`,
    },
    body: JSON.stringify({
      transaction_amount: 200,
      token: ct.id,
      description: 'Plan BASIC',
      installments: 1,
      payment_method_id: 'master',
      external_reference: 'cliente-25',
      notification_url: process.env.MERCADOPAGO_WEBHOOK_URL || undefined,
      payer: { email: 'comprador@test.com' },
    }),
  });
  const pay = await payRes.json();
  console.log('Payment HTTP:', payRes.status);
  console.log('Result:', pay.status, '|', pay.status_detail);
  if (pay.id) console.log('Payment ID:', pay.id);
  if (pay.message) console.log('Error:', pay.message, JSON.stringify(pay.cause));
}

testWithOriginalToken().catch(console.error);
