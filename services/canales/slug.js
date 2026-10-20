// services/canales/slug.js — slug del link público a partir del nombre del comercio
const crypto = require('crypto');

const RESERVADOS = new Set(['admin', 'api', 'app', 'catalogo', 'counter', 'dashboard', 'login', 'p']);

const slugify = (nombre) => String(nombre || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 40)
  .replace(/-+$/g, '');

/** Base legible + sufijo corto aleatorio: no adivinable por enumeración. */
const generarSlug = (nombre) => {
  let baseSlug = slugify(nombre);
  if (baseSlug.length < 3 || RESERVADOS.has(baseSlug)) baseSlug = 'pedidos';
  return `${baseSlug}-${crypto.randomBytes(3).toString('hex')}`;
};

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,60})[a-z0-9]$/;

module.exports = { slugify, generarSlug, SLUG_RE };
