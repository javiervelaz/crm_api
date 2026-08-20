#!/usr/bin/env node
// scripts/emailWorker.js
// Worker persistente para VPS/Docker. En Vercel no se usa: alla el drenado
// lo dispara el cron de n8n y el waitUntil post-request.
//
//   node scripts/emailWorker.js

require('dotenv').config();
const { startLoop } = require('../services/email/outboxWorker');
const pool = require('../pool');

const intervalMs = Number(process.env.EMAIL_WORKER_INTERVAL_MS || 15_000);

console.log(`[email/worker] arrancando — provider=${process.env.EMAIL_PROVIDER || 'auto'} cada ${intervalMs}ms`);
const detener = startLoop({ intervalMs });

const apagar = (senal) => {
  console.log(`[email/worker] ${senal} — cerrando`);
  detener();
  pool.end().then(() => process.exit(0)).catch(() => process.exit(1));
  setTimeout(() => process.exit(1), 10_000);
};

process.on('SIGTERM', () => apagar('SIGTERM'));
process.on('SIGINT', () => apagar('SIGINT'));
