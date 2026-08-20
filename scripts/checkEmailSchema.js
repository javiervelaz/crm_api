#!/usr/bin/env node
// scripts/checkEmailSchema.js
// Verifica el estado del esquema para el módulo de email y la activación.
// SOLO LECTURA: no crea, no altera, no borra nada. Se puede correr contra
// producción antes y después de aplicar las migraciones.
//
//   node scripts/checkEmailSchema.js
//
// Sin process.exit(): bajo `npm run` stdout es un pipe y en Windows exit()
// se come la salida.

require('dotenv').config();
const pool = require('../pool');

const ok   = (m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`);
const warn = (m) => console.log(`  \x1b[33m!\x1b[0m ${m}`);
const bad  = (m) => console.log(`  \x1b[31m✗\x1b[0m ${m}`);

let faltan = 0;
const falta = (m) => { faltan += 1; bad(m); };

const existeTabla = async (t) => (await pool.query(
  `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`, [t]
)).rowCount > 0;

const existeIndice = async (i) => (await pool.query(
  `SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname=$1`, [i]
)).rowCount > 0;

const existeConstraint = async (c) => (await pool.query(
  `SELECT 1 FROM pg_constraint WHERE conname=$1`, [c]
)).rowCount > 0;

async function main() {
  console.log('\nEsquema de email y activación\n');

  // ─── 003: prerequisito ──────────────────────────────────────────────────
  console.log('003_signup (prerequisito)');
  if (await existeTabla('email_verification')) ok('email_verification existe');
  else falta('Falta email_verification — aplicá 003_signup.sql primero');

  // ─── 004: cola de emails ────────────────────────────────────────────────
  console.log('\n004_email_outbox');
  if (await existeTabla('email_outbox')) {
    ok('email_outbox existe');
    for (const i of ['idx_email_outbox_claim', 'idx_email_outbox_cliente']) {
      if (await existeIndice(i)) ok(i);
      else falta(`Falta el índice ${i}`);
    }
    const { rows } = await pool.query(
      `SELECT status, count(*)::int AS total FROM email_outbox GROUP BY status ORDER BY status`
    );
    if (!rows.length) ok('Cola vacía');
    else rows.forEach((r) => ok(`${r.total} en estado "${r.status}"`));

    const { rows: viejos } = await pool.query(
      `SELECT count(*)::int AS n FROM email_outbox
        WHERE status = 'pending' AND scheduled_at < now() - interval '10 minutes'`
    );
    if (viejos[0].n > 0) {
      warn(`${viejos[0].n} mail(s) pendientes hace más de 10 min — ¿está corriendo el drenado?`);
    }
  } else {
    falta('Falta email_outbox — aplicá 004_email_outbox.sql');
  }

  // ─── 005: estados de cliente ────────────────────────────────────────────
  console.log('\n005_cliente_estado');
  if (await existeConstraint('chk_cliente_estado')) ok('chk_cliente_estado aplicado');
  else falta('Falta el CHECK chk_cliente_estado — aplicá 005_cliente_estado.sql');

  if (await existeIndice('idx_cliente_estado_pendiente')) ok('idx_cliente_estado_pendiente');
  else falta('Falta el índice idx_cliente_estado_pendiente');

  const { rows: estados } = await pool.query(
    `SELECT estado, count(*)::int AS total FROM cliente GROUP BY estado ORDER BY total DESC`
  );
  if (!estados.length) {
    warn('No hay clientes en la base');
  } else {
    estados.forEach((e) => ok(`${e.total} cliente(s) en "${e.estado}"`));
    const invalidos = estados.filter((e) => ![
      'PENDIENTE_VERIFICACION', 'ACTIVO', 'SUSPENDIDO', 'BLOQUEADO',
    ].includes(e.estado));
    if (invalidos.length) {
      falta(`Estados fuera del CHECK: ${invalidos.map((e) => e.estado).join(', ')}`);
    }
  }

  // ─── 006: el default venenoso de deleted_at ─────────────────────────────
  console.log('\n006_cliente_deleted_at');
  const { rows: def } = await pool.query(
    `SELECT column_default FROM information_schema.columns
      WHERE table_schema='public' AND table_name='cliente' AND column_name='deleted_at'`
  );
  if (!def.length) {
    warn('cliente.deleted_at no existe');
  } else if (def[0].column_default) {
    falta(`cliente.deleted_at todavía tiene DEFAULT ${def[0].column_default}`);
    bad('   Todo cliente nuevo nace soft-borrado y uq_cliente_cuit no matchea nada.');
  } else {
    ok('cliente.deleted_at sin default');
  }

  const { rows: borrados } = await pool.query(
    'SELECT count(*)::int AS n FROM cliente WHERE deleted_at IS NOT NULL'
  );
  if (borrados[0].n > 0) warn(`${borrados[0].n} cliente(s) con deleted_at seteado`);
  else ok('Ningún cliente marcado como borrado');

  console.log(
    faltan === 0
      ? '\n\x1b[32mEsquema completo.\x1b[0m\n'
      : `\n\x1b[31m${faltan} cosa(s) pendientes.\x1b[0m\n`
  );
  process.exitCode = faltan === 0 ? 0 : 1;
}

main()
  .catch((err) => {
    console.error('\nError consultando la base:', err.message);
    process.exitCode = 2;
  })
  .finally(() => pool.end().catch(() => {}));
