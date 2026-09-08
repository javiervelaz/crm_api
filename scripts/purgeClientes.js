#!/usr/bin/env node
// scripts/purgeClientes.js
// Purga los clientes que nunca hicieron nada. DRY-RUN POR DEFAULT.
//
//   node scripts/purgeClientes.js                  ← reporte, no borra nada
//   node scripts/purgeClientes.js --min-dias=7     ← cambia la antigüedad
//   node scripts/purgeClientes.js --apply          ← BORRA. Irreversible.
//
// Antes de --apply: creá un branch en Neon. Toma diez segundos y es tu única
// vuelta atrás.
//
// Sin process.exit(): bajo `npm run` stdout es un pipe y en Windows exit() se
// come la salida.

require('dotenv').config();
const pool = require('../pool');

const args = process.argv.slice(2);
const APLICAR = args.includes('--apply');
const MIN_DIAS = Number((args.find((a) => a.startsWith('--min-dias=')) || '').split('=')[1] || 30);

const c = { rojo: '\x1b[31m', verde: '\x1b[32m', amar: '\x1b[33m', gris: '\x1b[90m', neg: '\x1b[1m', off: '\x1b[0m' };

// Criterio de candidatos. TIENE que coincidir con el de
// migrations/008_purga_clientes_sin_actividad.sql — si tocás uno, tocá el otro.
const WHERE_CANDIDATOS = `
      c.id <> 1
  AND c.created_at < now() - ($1 || ' days')::interval
  AND NOT EXISTS (SELECT 1 FROM pedido               t WHERE t.cliente_id = c.id)
  AND NOT EXISTS (SELECT 1 FROM registro_diario      t WHERE t.cliente_id = c.id)
  AND NOT EXISTS (SELECT 1 FROM salida_caja          t WHERE t.cliente_id = c.id)
  AND NOT EXISTS (SELECT 1 FROM compra_insumo        t WHERE t.cliente_id = c.id)
  AND NOT EXISTS (SELECT 1 FROM producto             t WHERE t.cliente_id = c.id)
  AND NOT EXISTS (SELECT 1 FROM whatsapp_bot_cliente t WHERE t.cliente_id = c.id)
  AND NOT EXISTS (
        SELECT 1 FROM billing_subscription b
         WHERE b.cliente_id = c.id AND b.status NOT IN ('pending','cancelled')
      )`;

// Orden derivado del grafo de FK: hijos primero, cliente último.
const BORRADOS = [
  ['pedido_producto',       `pedido_id IN (SELECT id FROM pedido WHERE cliente_id = ANY($1))`],
  ['conteo_caja',           `registro_diario_id IN (SELECT id FROM registro_diario WHERE cliente_id = ANY($1))`],
  ['movimiento_inventario', `inventario_insumos_id IN (SELECT id FROM inventario_insumos WHERE cliente_id = ANY($1))`],
  ['movimiento_inventario', `registro_diario_id IN (SELECT id FROM registro_diario WHERE cliente_id = ANY($1))`],
  ['producto_img',          `producto_id IN (SELECT id FROM producto WHERE cliente_id = ANY($1))`],
  ['whatsapp_message',      `conversation_id IN (SELECT id FROM whatsapp_conversation WHERE cliente_id = ANY($1))`],
  ['compra_insumo',            `cliente_id = ANY($1)`],
  ['salida_caja',              `cliente_id = ANY($1)`],
  ['pedido',                   `cliente_id = ANY($1)`],
  ['registro_diario',          `cliente_id = ANY($1)`],
  ['inventario_insumos',       `cliente_id = ANY($1)`],
  ['producto',                 `cliente_id = ANY($1)`],
  ['tipo_producto',            `cliente_id = ANY($1)`],
  ['categoria_salida',         `cliente_id = ANY($1)`],
  ['whatsapp_conversation',    `cliente_id = ANY($1)`],
  ['whatsapp_bot_cliente',     `cliente_id = ANY($1)`],   // sin FK
  ['conversations',            `cliente_id = ANY($1)`],   // sin FK
  ['email_outbox',             `cliente_id = ANY($1)`],
  ['email_verification',       `cliente_id = ANY($1)`],
  ['logs',                     `cliente_id = ANY($1)`],
  ['user_rol',                 `cliente_id = ANY($1)`],
  ['rol_permiso',              `cliente_id = ANY($1)`],
  ['permiso',                  `cliente_id = ANY($1)`],
  ['modulo_rol',               `cliente_id = ANY($1)`],
  ['modulo',                   `cliente_id = ANY($1)`],
  ['rol',                      `cliente_id = ANY($1)`],   // sin FK; el ANY excluye NULL
  ['profile',                  `cliente_id = ANY($1)`],
  ['"user"',                   `cliente_id = ANY($1)`],
  ['billing_subscription',     `cliente_id = ANY($1)`],
  ['cliente_whatsapp_template',`cliente_id = ANY($1)`],
  ['sucursal',                 `cliente_id = ANY($1)`],
  ['cliente',                  `id = ANY($1)`],
];

async function listarCandidatos(client) {
  const { rows } = await client.query(
    `SELECT c.id, c.nombre, c.cuit, c.contacto_email, c.estado,
            c.created_at::date AS alta,
            (now()::date - c.created_at::date) AS dias
       FROM cliente c
      WHERE ${WHERE_CANDIDATOS}
      ORDER BY c.created_at`,
    [String(MIN_DIAS)]
  );
  return rows;
}

async function dryRun(client, ids) {
  console.log(`\n${c.neg}Filas que se borrarían por tabla${c.off}\n`);
  let total = 0;
  for (const [tabla, cond] of BORRADOS) {
    const { rows } = await client.query(
      `SELECT count(*)::int AS n FROM ${tabla} WHERE ${cond}`, [ids]
    );
    if (rows[0].n > 0) {
      total += rows[0].n;
      console.log(`  ${String(rows[0].n).padStart(6)}  ${tabla}`);
    }
  }
  console.log(`  ${c.neg}${String(total).padStart(6)}  TOTAL${c.off}\n`);
}

async function aplicar(client, ids) {
  console.log(`\n${c.neg}Borrando${c.off}\n`);
  let total = 0;
  for (const [tabla, cond] of BORRADOS) {
    const r = await client.query(`DELETE FROM ${tabla} WHERE ${cond}`, [ids]);
    if (r.rowCount > 0) {
      total += r.rowCount;
      console.log(`  ${String(r.rowCount).padStart(6)}  ${tabla}`);
    }
  }
  console.log(`  ${c.neg}${String(total).padStart(6)}  TOTAL${c.off}\n`);
}

async function main() {
  console.log(`\n${c.neg}Purga de clientes sin actividad${c.off}`);
  console.log(`${c.gris}Antigüedad mínima: ${MIN_DIAS} días · Modo: ${APLICAR ? 'APLICAR' : 'dry-run'}${c.off}`);
  console.log(`${c.gris}Se borra sólo si NO tiene: pedidos, caja, gastos, compras, productos ni bot.`);
  console.log(`Nunca se borra el cliente 1 ni nadie con suscripción distinta de pending/cancelled.${c.off}`);

  const client = await pool.connect();
  try {
    // Todo dentro de una transacción, también el dry-run: así el conteo es
    // consistente y en modo apply nada queda a medias.
    await client.query('BEGIN');

    const candidatos = await listarCandidatos(client);

    if (!candidatos.length) {
      console.log(`\n${c.verde}No hay clientes que cumplan el criterio. Nada para hacer.${c.off}\n`);
      await client.query('ROLLBACK');
      return;
    }

    console.log(`\n${c.neg}${candidatos.length} cliente(s) candidatos${c.off}\n`);
    for (const r of candidatos) {
      console.log(
        `  ${String(r.id).padStart(4)}  ${String(r.nombre || '').slice(0, 28).padEnd(28)}` +
        ` ${String(r.contacto_email || '').slice(0, 30).padEnd(30)}` +
        ` ${r.alta.toISOString().slice(0, 10)}  ${String(r.dias).padStart(4)}d  ${r.estado}`
      );
    }

    const ids = candidatos.map((r) => r.id);

    if (!APLICAR) {
      await dryRun(client, ids);
      await client.query('ROLLBACK');
      console.log(`${c.amar}DRY-RUN: no se borró nada.${c.off}`);
      console.log(`Para ejecutar de verdad: ${c.neg}node scripts/purgeClientes.js --apply${c.off}`);
      console.log(`${c.rojo}Antes, creá un branch en Neon. Es irreversible.${c.off}\n`);
      return;
    }

    await aplicar(client, ids);
    await client.query('COMMIT');
    console.log(`${c.verde}Listo. ${candidatos.length} cliente(s) eliminados.${c.off}\n`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(`\n${c.rojo}Falló y se hizo ROLLBACK — no se borró nada.${c.off}`);
    console.error(err.message);
    process.exitCode = 1;
  } finally {
    client.release();
  }
}

main()
  .catch((err) => {
    console.error('\nError:', err.message);
    process.exitCode = 2;
  })
  .finally(() => pool.end().catch(() => {}));
