#!/usr/bin/env node
// scripts/checkEmailDns.js
// Verifica el DNS de envío del dominio: SPF, DKIM y DMARC.
// Usa el resolver de Node, así que anda igual en Windows sin instalar dig.
//
//   node scripts/checkEmailDns.js
//   node scripts/checkEmailDns.js otrodominio.com

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
const dns = require('dns').promises;

const dominio = process.argv[2]
  || (process.env.EMAIL_FROM || '').split('@')[1]
  || 'countercrm.com';

const ok   = (m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`);
const warn = (m) => console.log(`  \x1b[33m!\x1b[0m ${m}`);
const bad  = (m) => console.log(`  \x1b[31m✗\x1b[0m ${m}`);

let problemas = 0;
const fallo = (m) => { problemas += 1; bad(m); };

async function txt(nombre) {
  try {
    // resolveTxt devuelve arrays de chunks: TXT largos vienen partidos en 255 bytes
    return (await dns.resolveTxt(nombre)).map((partes) => partes.join(''));
  } catch (err) {
    if (err.code === 'ENOTFOUND' || err.code === 'ENODATA') return [];
    throw err;
  }
}

async function mx(nombre) {
  try {
    return await dns.resolveMx(nombre);
  } catch (err) {
    if (err.code === 'ENOTFOUND' || err.code === 'ENODATA') return [];
    throw err;
  }
}

async function main() {
  console.log(`\nDNS de email para \x1b[1m${dominio}\x1b[0m\n`);

  // ─── SPF ────────────────────────────────────────────────────────────────
  //
  // OJO con dónde se chequea el SPF: se valida contra el dominio del
  // Return-Path (el MAIL FROM del sobre), NO contra el From que ve el usuario.
  //
  // Resend usa un subdominio propio como Return-Path — send.<dominio> — así
  // que su include:amazonses.com va ahí, no en la raíz. El SPF de la raíz sólo
  // cubre lo que se manda con la raíz como Return-Path (el reenvío de
  // Cloudflare Email Routing, por ejemplo).
  //
  // La alineación DMARC igual da OK: en modo relaxed, send.countercrm.com y
  // countercrm.com comparten dominio organizacional.
  console.log('SPF (raíz — cubre el reenvío de Cloudflare)');
  const registros = await txt(dominio);
  const spf = registros.filter((r) => r.toLowerCase().startsWith('v=spf1'));

  if (spf.length === 0) {
    warn('No hay SPF en la raíz. Sólo importa si mandás con la raíz como Return-Path.');
  } else if (spf.length > 1) {
    fallo(`Hay ${spf.length} registros SPF en la raíz. Sólo puede haber UNO — con dos el SPF`);
    fallo('es inválido y falla para TODOS los remitentes. Fusionalos en una sola línea:');
    spf.forEach((r) => console.log(`      ${r}`));
    const includes = [...new Set(spf.flatMap((r) => r.match(/include:\S+/g) || []))];
    console.log(`\n      Fusionado: v=spf1 ${includes.join(' ')} ~all\n`);
  } else {
    ok(spf[0]);
    if (/[~-]all/.test(spf[0])) ok(`Termina en ${spf[0].match(/[~-]all/)[0]}`);
    else warn('No termina en ~all ni -all: el SPF queda permisivo');
  }

  // ─── SPF del Return-Path de Resend ──────────────────────────────────────
  console.log(`\nSPF de envío (send.${dominio} — el que usa Resend)`);
  const spfSend = (await txt(`send.${dominio}`)).filter((r) => r.toLowerCase().startsWith('v=spf1'));

  if (spfSend.length === 0) {
    fallo(`No hay SPF en send.${dominio}. Agregá:`);
    console.log(`      TXT  send  →  v=spf1 include:amazonses.com ~all`);
  } else if (spfSend.length > 1) {
    fallo(`Hay ${spfSend.length} registros SPF en send.${dominio}. Sólo puede haber uno.`);
  } else if (!/include:amazonses\.com/i.test(spfSend[0])) {
    fallo(`${spfSend[0]} — le falta include:amazonses.com`);
  } else {
    ok(spfSend[0]);
  }

  // ─── DKIM ───────────────────────────────────────────────────────────────
  console.log('\nDKIM');
  const dkim = await txt(`resend._domainkey.${dominio}`);
  if (!dkim.length) fallo(`No hay TXT en resend._domainkey.${dominio}`);
  else if (!dkim.some((r) => /p=[A-Za-z0-9+/]/.test(r))) fallo('El registro DKIM existe pero no tiene clave pública (p=)');
  else ok(`resend._domainkey presente (${dkim[0].length} bytes)`);

  const mxSend = await mx(`send.${dominio}`);
  if (!mxSend.length) warn(`No hay MX en send.${dominio} — Resend lo usa para los bounces`);
  else ok(`send.${dominio} → ${mxSend.map((r) => r.exchange).join(', ')}`);

  // ─── DMARC ──────────────────────────────────────────────────────────────
  console.log('\nDMARC');
  const dmarc = (await txt(`_dmarc.${dominio}`)).filter((r) => r.toLowerCase().startsWith('v=dmarc1'));
  if (!dmarc.length) {
    fallo('No hay DMARC. Gmail y Outlook mandan a spam por defecto desde 2024.');
    console.log(`      TXT  _dmarc  →  v=DMARC1; p=none; rua=mailto:info@${dominio}; fo=1`);
  } else if (dmarc.length > 1) {
    fallo(`Hay ${dmarc.length} registros DMARC. Solo puede haber uno.`);
  } else {
    ok(dmarc[0]);
    const politica = (dmarc[0].match(/p=(\w+)/) || [])[1];
    if (politica === 'none') ok('p=none — correcto para arrancar; subí a quarantine en 2-3 semanas');
    if (!/rua=/.test(dmarc[0])) warn('Sin rua=: no vas a recibir los reportes agregados');
  }

  // ─── Recepción ──────────────────────────────────────────────────────────
  console.log('\nRecepción');
  const mxRoot = await mx(dominio);
  if (!mxRoot.length) warn(`Sin MX en ${dominio}: no podés recibir mails`);
  else mxRoot.forEach((r) => ok(`MX ${r.priority} ${r.exchange}`));

  console.log(
    problemas === 0
      ? '\n\x1b[32mDNS listo para enviar.\x1b[0m\n'
      : `\n\x1b[31m${problemas} problema(s). Arreglalos antes de mandar el primer mail real.\x1b[0m\n`
  );
  process.exitCode = problemas === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error('\nError consultando DNS:', err.message);
  process.exitCode = 2;
});
