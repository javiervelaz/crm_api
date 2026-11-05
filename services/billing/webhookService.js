// crm_api/services/billing/webhookService.js
//
// Procesa los avisos de MercadoPago. Regla general: el body del webhook solo
// dice QUÉ cambió; el estado real se consulta siempre a la API de MP.
//
// Tópicos (Webhooks, "Tus integraciones"):
//   payment                          → pagos únicos (Checkout Pro / Preference)
//   subscription_preapproval         → alta / pausa / cancelación de la suscripción
//   subscription_authorized_payment  → cada cobro mensual de la suscripción
// Se aceptan también 'preapproval' y 'authorized_payment' (nombres IPN).
//
// Todo evento firmado queda en billing_webhook_log.

const crypto = require('crypto');
const pool = require('../../pool');
// Por el objeto del módulo: así los tests pueden stubearlo
const mp = require('./mercadoPagoService');

const MP_API = 'https://api.mercadopago.com';

const TIPOS_PREAPPROVAL = new Set(['subscription_preapproval', 'preapproval']);
const TIPOS_COBRO = new Set(['subscription_authorized_payment', 'authorized_payment']);

// Estado de MP → estado en billing_subscription
const ESTADO_SUB = {
  pending: 'pending',
  authorized: 'active',
  paused: 'paused',
  cancelled: 'cancelled',
};

class MpApiError extends Error {
  constructor(status, path) {
    super(`MercadoPago ${path} respondió ${status}`);
    this.status = status;
  }
}

/**
 * Describe el token sin exponerlo: tipo (prefijo público de MP), largo y si
 * arrastra espacios, saltos de línea o comillas. Sirve para diagnosticar un
 * 401 de MP mirando billing_webhook_log, sin leer la variable de entorno.
 */
function describirToken(token) {
  if (token == null || token === '') return 'token=vacío';
  const t = String(token);
  const tipo = t.startsWith('APP_USR-') ? 'APP_USR' : t.startsWith('TEST-') ? 'TEST' : 'desconocido';
  const basura = [];
  if (t !== t.trim()) basura.push('espacios/saltos en los bordes');
  if (/[\r\n]/.test(t)) basura.push('salto de línea');
  if (/^["']|["']$/.test(t.trim())) basura.push('comillas');
  return `token=${tipo} largo=${t.length}${basura.length ? ` basura=${basura.join('+')}` : ''}`;
}

async function mpGet(path) {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  const res = await fetch(MP_API + path, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = new MpApiError(res.status, path);
    if (res.status === 401 || res.status === 403) err.message += ` (${describirToken(token)})`;
    throw err;
  }
  return res.json();
}

/**
 * Valida x-signature (HMAC-SHA256 sobre el manifest de MP).
 * Devuelve { ok: true } o { ok: false, status, error }.
 */
function verificarFirma(req) {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[BILLING WEBHOOK] MP_WEBHOOK_SECRET no está configurado -- rechazando request por seguridad');
    return { ok: false, status: 500, error: 'Webhook secret not configured' };
  }

  const xSignature = req.headers['x-signature'];
  const xRequestId = req.headers['x-request-id'];
  if (!xSignature || !xRequestId) {
    return { ok: false, status: 401, error: 'Missing webhook signature headers' };
  }

  const parts = String(xSignature).split(',').reduce((acc, part) => {
    const [key, value] = part.trim().split('=');
    acc[key] = value;
    return acc;
  }, {});
  const { ts, v1 } = parts;
  if (!ts || !v1) return { ok: false, status: 401, error: 'Malformed x-signature header' };

  // MP firma el data.id en minúsculas cuando es alfanumérico
  const dataId = String(req.query['data.id'] || '').toLowerCase();
  const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
  const esperado = crypto.createHmac('sha256', secret).update(manifest).digest('hex');

  const a = Buffer.from(esperado, 'utf8');
  const b = Buffer.from(String(v1), 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, status: 401, error: 'Invalid webhook signature' };
  }
  return { ok: true };
}

/** Nunca rompe el webhook: si el log falla, avisa y sigue. */
async function logEvento({ tipo, dataId, requestId, mpStatus, resultado, detalle, clienteId }) {
  try {
    await pool.query(
      `INSERT INTO billing_webhook_log (tipo, data_id, request_id, mp_status, resultado, detalle, cliente_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [tipo ?? null, dataId != null ? String(dataId) : null, requestId ?? null, mpStatus ?? null,
        resultado, detalle ?? null, clienteId != null ? Number(clienteId) || null : null]
    );
  } catch (err) {
    console.error('[BILLING WEBHOOK] No se pudo registrar el evento:', err.message);
  }
}

async function buscarSuscripcion(preapprovalId) {
  const { rows } = await pool.query(
    `SELECT id, cliente_id, tier_id, status, rubro_codigo, activada_at
       FROM billing_subscription
      WHERE mp_preapproval_id = $1`,
    [String(preapprovalId)]
  );
  return rows[0] || null;
}

/**
 * Sincroniza una suscripción con su preapproval en MP. La usan el webhook y
 * la reconciliación. Activa el tier una sola vez (activada_at); pausar o
 * cancelar no toca el vencimiento: lo que ya pagó lo usa hasta que vence y
 * el cron expire-tiers lo baja a FREE.
 */
async function aplicarPreapproval(preapprovalId) {
  const pre = await mpGet(`/preapproval/${encodeURIComponent(preapprovalId)}`);
  const mpStatus = pre.status || null;

  const sub = await buscarSuscripcion(preapprovalId);
  if (!sub) return { resultado: 'sin_registro', mpStatus, texto: 'OK' };

  const nuevo = ESTADO_SUB[mpStatus] || sub.status;
  await pool.query(
    `UPDATE billing_subscription
        SET status = $2, mp_status = $3, updated_at = now()
      WHERE id = $1`,
    [sub.id, nuevo, mpStatus]
  );

  if (mpStatus === 'authorized') {
    const act = await pool.query(
      `UPDATE billing_subscription SET activada_at = now()
        WHERE id = $1 AND activada_at IS NULL
        RETURNING id`,
      [sub.id]
    );
    if (act.rows.length > 0) {
      await mp.cubrirPeriodo(sub.cliente_id, sub.tier_id, new Date());
      return { resultado: 'activada', mpStatus, clienteId: sub.cliente_id, antes: sub.status, texto: 'OK' };
    }
    return { resultado: 'ya_activa', mpStatus, clienteId: sub.cliente_id, antes: sub.status, texto: 'OK' };
  }

  return { resultado: `estado_${nuevo}`, mpStatus, clienteId: sub.cliente_id, antes: sub.status, texto: 'OK' };
}

/**
 * Cobro mensual de una suscripción. Solo cuenta si el pago asociado salió
 * 'approved'. Idempotente por el id real del pago en MP.
 */
async function aplicarCobroSuscripcion(authorizedPaymentId) {
  const ap = await mpGet(`/authorized_payments/${encodeURIComponent(authorizedPaymentId)}`);
  const pagoStatus = ap.payment?.status || null;
  const mpStatus = pagoStatus || ap.status || null;

  if (pagoStatus !== 'approved' || !ap.payment?.id) {
    return { resultado: 'no_aprobado', mpStatus, texto: 'IGNORED' };
  }

  const sub = await buscarSuscripcion(ap.preapproval_id);
  if (!sub) return { resultado: 'sin_registro', mpStatus, texto: 'OK', detalle: `preapproval ${ap.preapproval_id}` };

  const nuevo = await mp.registrarPago({
    clienteId: sub.cliente_id,
    tierId: sub.tier_id,
    rubroCodigo: sub.rubro_codigo,
    mpPaymentId: ap.payment.id,
    monto: ap.transaction_amount,
    duracionMeses: 1,
    origen: 'suscripcion',
    mpPreapprovalId: String(ap.preapproval_id),
  });
  if (!nuevo) return { resultado: 'ya_procesado', mpStatus, clienteId: sub.cliente_id, texto: 'ALREADY PROCESSED' };

  try {
    await mp.cubrirPeriodo(sub.cliente_id, sub.tier_id, ap.debit_date || ap.date_created || new Date());
  } catch (err) {
    await mp.anularRegistroPago(ap.payment.id);
    throw err;
  }
  await pool.query(
    `UPDATE billing_subscription
        SET status = 'active', mp_status = 'authorized',
            activada_at = COALESCE(activada_at, now()), updated_at = now()
      WHERE id = $1 AND status <> 'cancelled'`,
    [sub.id]
  );
  return { resultado: 'cobro_registrado', mpStatus, clienteId: sub.cliente_id, texto: 'OK' };
}

/** Pago único (CUSTOM anual u otra oferta con duracion_meses > 1). */
async function aplicarPagoUnico(paymentId) {
  const payment = await mpGet(`/v1/payments/${encodeURIComponent(paymentId)}`);
  const mpStatus = payment.status || null;
  if (mpStatus !== 'approved') return { resultado: 'no_aprobado', mpStatus, texto: 'IGNORED' };

  const metadata = payment.metadata;
  // Los cobros de suscripciones también llegan como 'payment', sin nuestra
  // metadata: esos los procesa subscription_authorized_payment.
  if (!metadata || metadata.tipo !== 'pago_unico') return { resultado: 'no_es_pago_unico', mpStatus, texto: 'IGNORED' };

  const rawRef = payment.external_reference || '';
  const clienteId = rawRef.startsWith('cliente-') ? rawRef.replace('cliente-', '') : rawRef || null;
  const tierId = metadata.tier_id;
  const duracionMeses = Number(metadata.duracion_meses) || 1;
  if (!clienteId || !tierId) return { resultado: 'faltan_datos', mpStatus, texto: 'MISSING DATA' };

  const nuevo = await mp.registrarPagoUnico({
    clienteId, tierId, rubroCodigo: metadata.rubro_codigo,
    mpPaymentId: paymentId, monto: payment.transaction_amount, duracionMeses,
  });
  if (!nuevo) return { resultado: 'ya_procesado', mpStatus, clienteId, texto: 'ALREADY PROCESSED' };

  try {
    await mp.activateTierForCliente(clienteId, tierId, { meses: duracionMeses });
  } catch (err) {
    await mp.anularRegistroPago(paymentId);
    throw err;
  }
  return { resultado: 'pago_registrado', mpStatus, clienteId, texto: 'OK' };
}

/**
 * Despacha un evento ya firmado. Devuelve { http, texto }.
 * - 404 de MP (id inexistente, p. ej. el simulador del panel) → 200, queda en el log.
 * - Cualquier otro error → 500, así MP reintenta.
 */
async function procesarEvento(body = {}, { requestId } = {}) {
  const tipo = body.type || body.topic || null;
  const dataId = body.data?.id ?? body.id ?? null;

  let handler = null;
  if (TIPOS_PREAPPROVAL.has(tipo)) handler = aplicarPreapproval;
  else if (TIPOS_COBRO.has(tipo)) handler = aplicarCobroSuscripcion;
  else if (tipo === 'payment') handler = aplicarPagoUnico;

  if (!handler || dataId == null || dataId === '') {
    await logEvento({ tipo, dataId, requestId, resultado: 'ignorado' });
    return { http: 200, texto: 'IGNORED' };
  }

  try {
    const r = await handler(dataId);
    await logEvento({ tipo, dataId, requestId, mpStatus: r.mpStatus, resultado: r.resultado, detalle: r.detalle, clienteId: r.clienteId });
    return { http: 200, texto: r.texto };
  } catch (err) {
    if (err instanceof MpApiError && err.status === 404) {
      // Un cobro mensual puede avisarse antes de que la API de MP lo exponga
      // (visto en sandbox: 404 y 3 s después ya existía). Si respondemos 200,
      // MP no reintenta y el cobro se pierde: la reconciliación no mira
      // cobros. Para el resto (p. ej. el simulador del panel) 404 es final.
      if (TIPOS_COBRO.has(tipo)) {
        await logEvento({ tipo, dataId, requestId, resultado: 'not_found_reintento', detalle: err.message });
        return { http: 500, texto: 'RETRY' };
      }
      await logEvento({ tipo, dataId, requestId, resultado: 'not_found', detalle: err.message });
      return { http: 200, texto: 'NOT FOUND' };
    }
    console.error('[BILLING WEBHOOK] Error procesando evento:', err);
    await logEvento({ tipo, dataId, requestId, resultado: 'error', detalle: String(err.message || err).slice(0, 500) });
    return { http: 500, texto: 'ERROR' };
  }
}

/**
 * Reconciliación (cron diario desde n8n): trae de MP el estado de cada
 * suscripción viva y lo aplica. Sirve de red si se perdió un webhook.
 */
async function reconciliarSuscripciones() {
  const { rows } = await pool.query(
    `SELECT mp_preapproval_id
       FROM billing_subscription
      WHERE mp_preapproval_id IS NOT NULL
        AND mp_preapproval_id NOT LIKE 'mock-%'
        AND status IN ('pending', 'active', 'paused')
      ORDER BY id`
  );

  const cambios = [];
  const errores = [];
  for (const { mp_preapproval_id: id } of rows) {
    try {
      const r = await aplicarPreapproval(id);
      await logEvento({ tipo: 'reconciliacion', dataId: id, mpStatus: r.mpStatus, resultado: r.resultado, clienteId: r.clienteId });
      const despues = ESTADO_SUB[r.mpStatus] || r.antes;
      if (r.resultado === 'activada' || (r.antes && despues !== r.antes)) {
        cambios.push({ preapprovalId: id, antes: r.antes, despues, resultado: r.resultado });
      }
    } catch (err) {
      const resultado = err instanceof MpApiError && err.status === 404 ? 'not_found' : 'error';
      await logEvento({ tipo: 'reconciliacion', dataId: id, resultado, detalle: String(err.message || err).slice(0, 500) });
      errores.push({ preapprovalId: id, error: resultado });
    }
  }
  return { revisadas: rows.length, cambios, errores };
}

module.exports = {
  verificarFirma,
  procesarEvento,
  aplicarPreapproval,
  aplicarCobroSuscripcion,
  aplicarPagoUnico,
  reconciliarSuscripciones,
  logEvento,
  describirToken,
  MpApiError,
};
