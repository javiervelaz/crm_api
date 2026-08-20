#!/usr/bin/env node
// scripts/previewEmail.js
// Renderiza un template con datos de ejemplo y lo escribe en /tmp para abrirlo
// en el navegador. No manda nada ni toca la base.
//
//   node scripts/previewEmail.js welcome
//   node scripts/previewEmail.js welcome '{"nombreComercio":"La Esquina"}'

require('dotenv').config();
const fs = require('fs');
const os = require('os');
const path = require('path');
const { render, listTemplates } = require('../services/email/renderer');

const nombre = process.argv[2];

if (!nombre) {
  console.log('Uso: node scripts/previewEmail.js <template> [json]');
  console.log('Disponibles:', listTemplates().join(', '));
}

const EJEMPLOS = {
  welcome: {
    nombreContacto: 'Javier',
    nombreComercio: 'Panadería La Esquina',
    plan: 'PREMIUM',
    ttlDias: 7,
    urlLogin: 'https://app.countercrm.com/',
    urlLoginTexto: 'app.countercrm.com',
    urlVerificacion: 'https://app.countercrm.com/auth/verificar?token=' + 'a1b2c3d4'.repeat(8),
  },
};

let data = EJEMPLOS[nombre] || {};
if (process.argv[3]) {
  try {
    data = { ...data, ...JSON.parse(process.argv[3]) };
  } catch (err) {
    console.error('El segundo argumento no es JSON válido:', err.message);
    process.exitCode = 1;
  }
}

try {
  const { subject, html, text } = render(nombre, data);
  const destino = path.join(os.tmpdir(), `counter-email-${nombre}.html`);
  fs.writeFileSync(destino, html, 'utf8');

  console.log(`\nAsunto: ${subject}`);
  console.log(`HTML:   ${destino} (${(html.length / 1024).toFixed(1)} KB)`);
  console.log('\n─────────── texto plano ───────────');
  console.log(text);
  console.log('───────────────────────────────────\n');
} catch (err) {
  console.error('Error renderizando:', err.message);
  process.exitCode = 1;
}
