// services/edu/cuotasCron.js — tareas que dispara n8n (secreto compartido, sin usuario).
const crypto = require('crypto');
const pool = require('../../pool');
const mailer = require('../email');
const { runWith } = require('../../tenantContext');
const db = require('../../model/edu/cuotas');
const cuotasService = require('./cuotasService');
const { hoy } = require('./reglas');
const R = require('./cuotasReglas');

/**
 * Corre `fn` como si fuera un request del tenant: una transacción propia con
 * app.cliente_id, y el pool proxy enruta ahí. COMMIT esperado antes de seguir.
 */
const conTenant = async (cliente_id, fn) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.cliente_id', $1, true)`, [String(cliente_id)]);
    const resultado = await runWith({ clienteId: cliente_id, getClient: async () => client }, fn);
    await client.query('COMMIT');
    return resultado;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* conexión ya caída */ }
    throw err;
  } finally {
    client.release();
  }
};

/** Genera las cuotas del mes (por defecto el actual) de todas las academias. Un tenant roto no frena a los demás. */
const generarTodas = async (periodo = R.primerDia(hoy())) => {
  const clientes = await db.clientesConAlumnos();
  const resultados = [];
  for (const cliente_id of clientes) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const r = await conTenant(cliente_id, () => cuotasService.generarPeriodo(cliente_id, periodo));
      resultados.push({ cliente_id, ...r });
    } catch (err) {
      console.error(`[cron/edu-cuotas] cliente ${cliente_id}:`, err.message);
      resultados.push({ cliente_id, error: err.message });
    }
  }
  return {
    periodo,
    clientes: clientes.length,
    creadas: resultados.reduce((s, r) => s + (r.creadas ?? 0), 0),
    con_error: resultados.filter((r) => r.error).length,
    resultados,
  };
};

/** Pagos esperando revisión que todavía no se avisaron al admin, agrupados por academia. */
const pendientesDeAviso = async () => {
  const filas = await db.pendientesSinNotificar();
  const porCliente = new Map();
  for (const f of filas) {
    porCliente.set(f.cliente_id, [...(porCliente.get(f.cliente_id) ?? []), {
      id: f.id, alumnos: f.alumnos, importe: Number(f.importe), fecha_pago: f.fecha_pago,
      fuera_de_termino: f.fuera_de_termino, subido: f.created_at,
    }]);
  }
  return [...porCliente.entries()].map(([cliente_id, pagos]) => ({ cliente_id, pagos }));
};

const marcarAvisados = async (ids) => {
  const lista = [...new Set((Array.isArray(ids) ? ids : []).map(Number))].filter((n) => Number.isInteger(n) && n > 0);
  return { marcados: lista.length ? await db.marcarNotificados(lista) : 0 };
};

const MONEDA = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 });
const fechaCorta = (iso) => (iso ? String(iso).split('-').reverse().join('/') : '');

/**
 * Avisa por mail al contacto de cada academia que tiene pagos esperando revisión
 * y los marca como avisados. Un solo mail por academia y corrida. Si falla una
 * academia las demás siguen; sus pagos quedan sin avisar y se reintentan en la
 * próxima corrida (la idempotencyKey evita el mail doble si falló el marcado).
 */
const avisarPendientes = async () => {
  const grupos = await pendientesDeAviso();
  if (!grupos.length) return { academias: 0, avisadas: 0, pagos: 0, sin_email: [], con_error: 0 };

  const contactos = new Map((await db.contactosAcademias(grupos.map((g) => g.cliente_id))).map((c) => [c.id, c]));
  const base = String(process.env.PLATFORM_BASE_URL || '').replace(/\/$/, '');
  const out = { academias: grupos.length, avisadas: 0, pagos: 0, sin_email: [], con_error: 0 };

  for (const { cliente_id, pagos } of grupos) {
    const c = contactos.get(cliente_id);
    if (!c?.contacto_email) {
      out.sin_email.push(cliente_id);
      continue;
    }
    const ids = pagos.map((p) => p.id);
    const clave = crypto.createHash('sha1').update(ids.join(',')).digest('hex').slice(0, 16);
    try {
      // eslint-disable-next-line no-await-in-loop
      await mailer.enqueue({
        template: 'edu-pagos-pendientes',
        to: c.contacto_email,
        toName: c.contacto_nombre || undefined,
        clienteId: cliente_id,
        idempotencyKey: `edu-pagos-pendientes:${cliente_id}:${clave}`,
        data: {
          nombreContacto: c.contacto_nombre || '',
          nombreComercio: c.nombre,
          cantidad: pagos.length,
          uno: pagos.length === 1,
          urlPagos: `${base}/dashboard/academia/pagos`,
          pagos: pagos.map((p) => ({
            alumnos: p.alumnos, importe: MONEDA.format(p.importe), fecha: fechaCorta(p.fecha_pago), fueraDeTermino: p.fuera_de_termino,
          })),
        },
      });
      // eslint-disable-next-line no-await-in-loop
      await db.marcarNotificados(ids);
      out.avisadas += 1;
      out.pagos += ids.length;
    } catch (err) {
      out.con_error += 1;
      console.error(`[cron/edu-cuotas] aviso cliente ${cliente_id}:`, err.message);
    }
  }
  return out;
};

module.exports = { conTenant, generarTodas, pendientesDeAviso, marcarAvisados, avisarPendientes };
