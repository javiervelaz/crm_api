// services/email/renderer.js
// Render de templates: MJML precompilado + Handlebars.
//
// Por que precompilado: compilar MJML en runtime cuesta ~200ms, arrastra una
// dependencia pesada a produccion y en mjml 5 es asincronico. `npm run
// email:build` deja el HTML listo en templates/dist/ y eso es lo unico que se
// despliega; el dist se commitea. El prestart lo regenera en cada arranque
// local, asi que en dev alcanza con editar el .mjml y reiniciar.

const fs = require('fs');
const path = require('path');
const Handlebars = require('handlebars');

/**
 * Helper {{url x}} para atributos href.
 *
 * El escape por defecto de Handlebars convierte "?token=abc" en
 * "?token&#x3D;abc". Es HTML valido y el navegador lo decodifica, pero varios
 * clientes de mail y escaneres de links lo parsean mal. Este helper escapa
 * solo lo que hace falta en un atributo y ademas corta esquemas que no sean
 * http(s), asi un javascript: nunca llega a un href.
 */
Handlebars.registerHelper('url', (valor) => {
  const s = String(valor == null ? '' : valor).trim();
  if (!/^https?:\/\//i.test(s)) return '';
  return new Handlebars.SafeString(
    s.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
     .replace(/</g, '&lt;').replace(/>/g, '&gt;')
  );
});

const TEMPLATES_DIR = path.join(__dirname, 'templates');
const DIST_DIR = path.join(TEMPLATES_DIR, 'dist');

// En serverless el cache vive lo que vive el contenedor: se paga una vez por
// cold start, no por mail.
const cache = new Map();

function faltaDist(name) {
  const src = path.join(TEMPLATES_DIR, `${name}.mjml`);
  if (!fs.existsSync(src)) {
    throw new Error(`Template "${name}" no existe (falta ${name}.mjml)`);
  }
  // MJML 5 compila de forma asincronica, asi que no se puede compilar al vuelo
  // desde un render() sincronico. El dist se genera en build y se commitea:
  // produccion no necesita mjml instalado.
  throw new Error(
    `Falta templates/dist/${name}.html. Corré "npm run email:build".`
  );
}

function readTemplate(name) {
  if (cache.has(name)) return cache.get(name);

  const distFile = path.join(DIST_DIR, `${name}.html`);
  if (!fs.existsSync(distFile)) faltaDist(name);
  const html = fs.readFileSync(distFile, 'utf8');

  const subjectFile = path.join(TEMPLATES_DIR, `${name}.subject.hbs`);
  const textFile = path.join(TEMPLATES_DIR, `${name}.txt.hbs`);

  if (!fs.existsSync(subjectFile)) throw new Error(`Falta ${name}.subject.hbs`);
  if (!fs.existsSync(textFile)) throw new Error(`Falta ${name}.txt.hbs`);

  const entry = {
    // El HTML escapa: un comercio llamado <script>alert(1)</script> sale inerte.
    html: Handlebars.compile(html, { noEscape: false }),
    // El asunto y el texto plano NO escapan: ahi no hay HTML que envenenar, y
    // escapar convierte "?token=abc" en "?token&#x3D;abc", que rompe el link
    // que el usuario copia a mano cuando el boton no le funciona.
    subject: Handlebars.compile(fs.readFileSync(subjectFile, 'utf8'), { noEscape: true }),
    text: Handlebars.compile(fs.readFileSync(textFile, 'utf8'), { noEscape: true }),
  };

  cache.set(name, entry);
  return entry;
}

/**
 * Renderiza un template. Handlebars escapa por defecto: un comercio llamado
 * <script>alert(1)</script> sale escapado en el HTML.
 * @returns {{subject: string, html: string, text: string}}
 */
function render(name, data = {}) {
  const tpl = readTemplate(name);

  // El asunto se resuelve primero: el layout lo usa en <mj-title> y el
  // preheader es lo que se ve en la lista de la bandeja.
  const subject = tpl.subject(data).trim().replace(/\s+/g, ' ');
  const text = tpl.text(data).trim();
  const preheader = data.preheader || text.split('\n')[0].slice(0, 120);

  const html = tpl.html({ ...data, subject, preheader });

  return { subject, html, text };
}

/** Solo para tests: fuerza recarga desde disco. */
function clearCache() { cache.clear(); }

/** Lista los templates disponibles (por sus .mjml fuente). */
function listTemplates() {
  return fs.readdirSync(TEMPLATES_DIR)
    .filter((f) => f.endsWith('.mjml'))
    .map((f) => f.replace(/\.mjml$/, ''));
}

module.exports = { render, clearCache, listTemplates };
