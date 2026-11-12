// services/tracking/metaCapiService.js
//
// API de Conversiones de Meta (eventos server-side). Complementa al Pixel del
// navegador: el mismo evento viaja por los dos caminos con el mismo event_id y
// Meta lo deduplica.
//
// Reglas:
//  - Nunca tira: un problema con Meta no puede romper el alta ni la carga de un pedido.
//  - Sin META_PIXEL_ID o META_CAPI_TOKEN queda apagado (no hace I/O ni queries).
//  - Los datos personales viajan hasheados (SHA-256, normalizados como pide Meta).
//  - No se loguea el token ni datos personales.
//
// Env: META_PIXEL_ID, META_CAPI_TOKEN, META_CAPI_TEST_CODE (solo mientras se prueba),
//      META_GRAPH_VERSION (default v23.0), PLATFORM_BASE_URL.
const crypto = require('crypto');
const pool = require('../../pool');

const TIMEOUT_MS = 3000;
const yaEnviado = new Set(); // clienteId con FirstOrder resuelto en este proceso

const config = () => ({
  pixelId: process.env.META_PIXEL_ID || '',
  token: process.env.META_CAPI_TOKEN || '',
  testCode: process.env.META_CAPI_TEST_CODE || '',
  version: process.env.META_GRAPH_VERSION || 'v23.0',
});

const configurado = () => {
  const { pixelId, token } = config();
  return Boolean(pixelId && token);
};

const sha256 = (valor) => crypto.createHash('sha256').update(valor).digest('hex');

const hashear = (valor, normalizar = (v) => v.trim().toLowerCase()) => {
  if (valor === null || valor === undefined) return undefined;
  const limpio = normalizar(String(valor));
  return limpio ? sha256(limpio) : undefined;
};

// Meta pide el teléfono solo con dígitos y código de país. Los alta de AR vienen
// con 10 a 13 dígitos (con o sin 54 / 0 / 15).
const normalizarTelefono = (v) => {
  let d = v.replace(/\D/g, '');
  if (d.startsWith('0')) d = d.replace(/^0+/, '');
  if (d.length === 10) d = `54${d}`;
  return d;
};

const limpiarIp = (ip) => {
  if (!ip) return undefined;
  const s = String(ip).trim().replace(/^::ffff:/i, '');
  return s || undefined;
};

// fbc = fb.1.<timestamp ms>.<fbclid>. Si el navegador no mandó la cookie pero hay fbclid, se arma.
const resolverFbc = (fbc, fbclid, ahora = Date.now()) => {
  if (fbc) return String(fbc).slice(0, 255);
  if (fbclid) return `fb.1.${ahora}.${String(fbclid).slice(0, 200)}`;
  return undefined;
};

const sinVacios = (obj) =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== ''));

const armarUserData = ({ email, telefono, nombre, apellido, clienteId, ip, userAgent, fbp, fbc }) =>
  sinVacios({
    em: email ? [hashear(email)] : undefined,
    ph: telefono ? [hashear(telefono, normalizarTelefono)] : undefined,
    fn: nombre ? [hashear(nombre)] : undefined,
    ln: apellido ? [hashear(apellido)] : undefined,
    external_id: clienteId ? [hashear(String(clienteId))] : undefined,
    country: [sha256('ar')],
    client_ip_address: limpiarIp(ip),
    client_user_agent: userAgent ? String(userAgent).slice(0, 500) : undefined,
    fbp: fbp ? String(fbp).slice(0, 255) : undefined,
    fbc: fbc ? String(fbc).slice(0, 255) : undefined,
  });

/**
 * Envía un evento. Devuelve true si Meta lo aceptó; false en cualquier otro caso.
 */
const enviarEvento = async ({ eventName, eventId, eventTime, sourceUrl, userData, customData }) => {
  if (!configurado()) return false;
  const { pixelId, token, testCode, version } = config();

  const body = {
    data: [
      sinVacios({
        event_name: eventName,
        event_time: eventTime || Math.floor(Date.now() / 1000),
        event_id: eventId,
        action_source: 'website',
        event_source_url: sourceUrl,
        user_data: userData,
        custom_data: customData && Object.keys(customData).length ? sinVacios(customData) : undefined,
      }),
    ],
    access_token: token,
    ...(testCode && { test_event_code: testCode }),
  };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`https://graph.facebook.com/${version}/${encodeURIComponent(pixelId)}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      let detalle = '';
      try {
        const j = await res.json();
        detalle = j && j.error ? `${j.error.type || ''} ${j.error.code || ''} ${j.error.message || ''}`.trim() : '';
      } catch (_) { /* cuerpo no JSON */ }
      console.error(`[metaCapi] ${eventName} rechazado (${res.status}) ${detalle}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[metaCapi] ${eventName} falló:`, err.name === 'AbortError' ? 'timeout' : err.message);
    return false;
  } finally {
    clearTimeout(timer);
  }
};

const urlPlataforma = (ruta) => {
  const base = (process.env.PLATFORM_BASE_URL || 'https://app.countercrm.com').replace(/\/$/, '');
  return `${base}${ruta}`;
};

/** CompleteRegistration: se llama al terminar el alta. eventId lo genera el front (dedupe con el Pixel). */
const notificarRegistro = async ({ cliente, adminUser, telefono, plan, rubro, eventId, ip, userAgent, fbp, fbc, sourceUrl }) => {
  if (!configurado()) return false;
  try {
    return await enviarEvento({
      eventName: 'CompleteRegistration',
      eventId,
      sourceUrl: sourceUrl || urlPlataforma('/saas'),
      userData: armarUserData({
        email: adminUser && adminUser.email,
        telefono,
        nombre: adminUser && adminUser.nombre,
        apellido: adminUser && adminUser.apellido,
        clienteId: cliente.id,
        ip,
        userAgent,
        fbp,
        fbc,
      }),
      customData: { content_name: 'signup', plan, rubro },
    });
  } catch (err) {
    console.error('[metaCapi] notificarRegistro:', err.message);
    return false;
  }
};

/**
 * FirstOrder: el comercio cargó su primer pedido (la métrica de activación).
 * Una sola vez por comercio: el UPDATE condicional es el dedupe; si el envío falla
 * se libera la marca para reintentar con el próximo pedido.
 */
const notificarPrimerPedido = async (clienteId) => {
  if (!configurado() || !clienteId || yaEnviado.has(clienteId)) return false;
  let reclamado = false;
  try {
    const { rows } = await pool.queryDirecta(
      `UPDATE cliente SET meta_first_order_sent_at = now()
        WHERE id = $1 AND meta_first_order_sent_at IS NULL
        RETURNING id, contacto_email, contacto_nombre, contacto_apellido, contacto_telefono,
                  signup_ip, meta_fbp, meta_fbc, meta_ua, utm_source, utm_campaign, utm_content, rubro_codigo`,
      [clienteId]
    );
    if (!rows.length) {
      yaEnviado.add(clienteId);
      return false;
    }
    reclamado = true;
    const c = rows[0];
    const ok = await enviarEvento({
      eventName: 'FirstOrder',
      eventId: `firstorder-${c.id}`,
      sourceUrl: urlPlataforma('/dashboard'),
      userData: armarUserData({
        email: c.contacto_email,
        telefono: c.contacto_telefono,
        nombre: c.contacto_nombre,
        apellido: c.contacto_apellido,
        clienteId: c.id,
        ip: c.signup_ip,
        userAgent: c.meta_ua,
        fbp: c.meta_fbp,
        fbc: c.meta_fbc,
      }),
      customData: { content_name: 'primer_pedido', rubro: c.rubro_codigo, utm_source: c.utm_source, utm_campaign: c.utm_campaign, utm_content: c.utm_content },
    });
    if (ok) {
      yaEnviado.add(clienteId);
    } else {
      await liberar(clienteId);
    }
    return ok;
  } catch (err) {
    console.error('[metaCapi] notificarPrimerPedido:', err.message);
    if (reclamado) await liberar(clienteId);
    return false;
  }
};

const liberar = async (clienteId) => {
  try {
    await pool.queryDirecta('UPDATE cliente SET meta_first_order_sent_at = NULL WHERE id = $1', [clienteId]);
  } catch (_) { /* se reintenta con el próximo pedido o queda marcado */ }
};

module.exports = {
  configurado,
  enviarEvento,
  notificarRegistro,
  notificarPrimerPedido,
  // expuestos para tests
  hashear,
  normalizarTelefono,
  limpiarIp,
  resolverFbc,
  armarUserData,
  _reset: () => yaEnviado.clear(),
};
