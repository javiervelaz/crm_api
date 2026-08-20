#!/usr/bin/env node
// scripts/testEmail.js
// Manda un mail REAL por el provider configurado. No toca la base ni la cola:
// va directo por sendNow(), para aislar si el problema es el proveedor o la
// cola cuando algo falla.
//
//   node scripts/testEmail.js javi@gmail.com
//   node scripts/testEmail.js javi@gmail.com verify
//   node scripts/testEmail.js test-abc123@srv1.mail-tester.com

// NOTA: estos scripts NO usan process.exit().
//
// Cuando corren bajo `npm run`, stdout es un pipe. En Windows las escrituras a
// un pipe son asincrónicas, y process.exit() mata el proceso antes de que el
// buffer se vacíe: se pierde TODA la salida, no sólo la última línea. Se ve
// como un comando que "no hace nada".
//
// Seteando process.exitCode el proceso termina solo cuando no queda trabajo
// pendiente, y ahí sí Node vacía stdout antes de salir.

require('dotenv').config();
const mailer = require('../services/email');

const destino = process.argv[2];
const template = process.argv[3] || 'welcome';

if (!destino) {
  console.log('Uso: node scripts/testEmail.js <email> [template]');
  console.log('Templates:', mailer.listTemplates().join(', '));
  process.exitCode = 1;
}

const provider = process.env.EMAIL_PROVIDER
  || (process.env.NODE_ENV === 'production' ? 'resend' : 'console');

const DATOS = {
  nombreContacto: 'Javier',
  nombreComercio: 'Panadería La Esquina',
  plan: 'FREE',
  ttlDias: Number(process.env.VERIFICACION_TTL_DIAS || 7),
  urlLogin: `${process.env.PLATFORM_BASE_URL || 'https://app.countercrm.com'}/`,
  urlLoginTexto: String(process.env.PLATFORM_BASE_URL || 'https://app.countercrm.com')
    .replace(/^https?:\/\//, ''),
  urlVerificacion: `${process.env.PLATFORM_BASE_URL || 'https://app.countercrm.com'}/auth/verificar?token=${'0'.repeat(64)}`,
};

async function main() {
  console.log(`\nProvider:  ${provider}`);
  console.log(`Template:  ${template}`);
  console.log(`De:        ${process.env.EMAIL_FROM_NAME || 'Counter'} <${process.env.EMAIL_FROM || '(sin EMAIL_FROM)'}>`);
  console.log(`Para:      ${destino}`);

  // Cortamos acá en vez de "enviar" por consola: un ✓ verde al final después
  // de no haber mandado nada es peor que un error, porque parece que anduvo.
  if (provider === 'console') {
    console.error('\n\x1b[33mEMAIL_PROVIDER=console — este provider NO envía, imprime.\x1b[0m');
    console.error('\nPara mandar de verdad, agregá al .env:');
    console.error('  EMAIL_PROVIDER=resend');
    console.error('  RESEND_API_KEY=re_xxxxxxxx');
    console.error('  EMAIL_FROM=info@countercrm.com');
    console.error('\nO para ver el render sin enviar: npm run email:preview welcome\n');
    process.exitCode = 1;
    return;
  }
  if (provider === 'resend' && !process.env.RESEND_API_KEY) {
    console.error('\n\x1b[31mFalta RESEND_API_KEY en el .env\x1b[0m\n');
    process.exitCode = 1;
    return;
  }

  console.log('\nEnviando...\n');

  try {
    const { providerMessageId } = await mailer.sendNow({
      template,
      to: destino,
      toName: 'Javier',
      data: DATOS,
    });
    console.log(`\x1b[32m✓ Enviado de verdad por ${provider}.\x1b[0m id: ${providerMessageId}\n`);
    if (provider === 'resend') {
      console.log('Seguimiento en https://resend.com/emails\n');
    }
  } catch (err) {
    console.error(`\x1b[31m✗ Falló:\x1b[0m ${err.message}`);
    if (err.permanent) {
      console.error('\nEs un error PERMANENTE: reintentar no lo arregla.');
      console.error('Suele ser el dominio sin verificar, el From equivocado o el destinatario inválido.');
    } else {
      console.error('\nEs un error TRANSITORIO: en producción la cola lo reintenta sola.');
    }
    process.exitCode = 1;
  }
}

if (destino) main();
