#!/usr/bin/env node
// scripts/buildEmailTemplates.js
// Compila services/email/templates/*.mjml -> templates/dist/*.html
// El dist se commitea: produccion no necesita mjml instalado.
//
//   node scripts/buildEmailTemplates.js

const fs = require('fs');
const path = require('path');

const TEMPLATES_DIR = path.join(__dirname, '..', 'services', 'email', 'templates');
const DIST_DIR = path.join(TEMPLATES_DIR, 'dist');

// Sin process.exit(): bajo `npm run` stdout es un pipe y en Windows las
// escrituras son asincrónicas — exit() se come toda la salida y el comando
// parece no hacer nada. Cortamos con return y process.exitCode.
async function main() {
  let mjml2html;
  try {
    mjml2html = require('mjml');
  } catch {
    console.error('Falta mjml. Instalalo con: npm i -D mjml');
    process.exitCode = 1;
    return;
  }

  fs.mkdirSync(DIST_DIR, { recursive: true });

  const fuentes = fs.readdirSync(TEMPLATES_DIR).filter((f) => f.endsWith('.mjml'));
  if (!fuentes.length) {
    console.error(`No hay .mjml en ${TEMPLATES_DIR}`);
    process.exitCode = 1;
    return;
  }

  let fallos = 0;

for (const archivo of fuentes) {
  const nombre = archivo.replace(/\.mjml$/, '');
  const origen = path.join(TEMPLATES_DIR, archivo);

  // mjml 5 devuelve una promesa, a diferencia de la 4
  const { html, errors } = await mjml2html(fs.readFileSync(origen, 'utf8'), {
    filePath: origen,
    validationLevel: 'strict',
    minify: false,
    // Sin esto MJML inyecta un <link> a fonts.googleapis.com en cada mail:
    // Gmail lo bloquea igual, y es una fuga de datos hacia Google en cada
    // apertura. Usamos la stack de fuentes del sistema.
    fonts: {},
  });

  if (errors && errors.length) {
    fallos += 1;
    console.error(`✗ ${archivo}`);
    errors.forEach((e) => console.error(`    ${e.formattedMessage}`));
    continue;
  }

  // Chequeo de coherencia: cada template necesita su asunto y su texto plano.
  // Sin el texto plano, los filtros anti-spam te penalizan.
  for (const requerido of [`${nombre}.subject.hbs`, `${nombre}.txt.hbs`]) {
    if (!fs.existsSync(path.join(TEMPLATES_DIR, requerido))) {
      fallos += 1;
      console.error(`✗ ${archivo}: falta ${requerido}`);
    }
  }

  const destino = path.join(DIST_DIR, `${nombre}.html`);
  fs.writeFileSync(destino, html, 'utf8');
  console.log(`✓ ${archivo} → dist/${nombre}.html (${(html.length / 1024).toFixed(1)} KB)`);
}

  if (fallos) {
    process.exitCode = 1;
    return;
  }
  console.log(`\n${fuentes.length} template(s) compilados.`);
}

main().catch((err) => {
  console.error('Error compilando templates:', err);
  process.exitCode = 1;
});
