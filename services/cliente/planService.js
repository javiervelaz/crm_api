// crm_api/services/cliente/planService.js
const pool = require('../../pool');

const PLAN_FEATURES = {
  FREE: {
    canUseReports: false,
    canUseWhatsappBot: false,
    canUseBot: false,             // bots de Telegram / WhatsApp
    canUsePedidosOnline: true,    // link público del micrositio
    maxPedidosMensuales: 50,
    maxProductos: 5,
    diasDeTrial: 14,
  },
  BASIC: {
    canUseReports: false,
    canUseWhatsappBot: false,
    canUseBot: false,
    canUsePedidosOnline: true,
    maxPedidosMensuales: null,
    maxProductos: null,
  },
  PREMIUM: {
    canUseReports: true,
    canUseWhatsappBot: true,
    canUseBot: true,
    canUsePedidosOnline: true,
    maxPedidosMensuales: null,
    maxProductos: null,
  },
};
// CUSTOM = PREMIUM pagado anual con descuento: mismas prestaciones.
PLAN_FEATURES.CUSTOM = { ...PLAN_FEATURES.PREMIUM };


// Avisos de configuración faltante: una vez por combinación, no en cada request
const avisados = new Set();
const avisarUnaVez = (clave, msg) => {
  if (avisados.has(clave)) return;
  avisados.add(clave);
  console.warn(msg);
};

/**
 * Features efectivas: las de rubro_tier (migración 019) sobre los defaults de
 * PLAN_FEATURES del tier. Sin fila para el rubro → defaults (con aviso).
 */
const resolverFeatures = ({ tierCode, rubroCodigo, rubroFeatures, clienteId }) => {
  let base = PLAN_FEATURES[tierCode];
  if (!base) {
    // Que un tier nuevo sin features no vuelva a degradarse a FREE en silencio
    console.warn(`[planService] tier desconocido "${tierCode}" (cliente ${clienteId}): se aplican features de FREE`);
    base = PLAN_FEATURES.FREE;
  } else if (!rubroFeatures) {
    avisarUnaVez(`${rubroCodigo}:${tierCode}`,
      `[planService] sin rubro_tier para ${rubroCodigo}/${tierCode}: se aplican los defaults del tier`);
  }
  return rubroFeatures ? { ...base, ...rubroFeatures } : base;
};

const getClienteTierAndFeatures = async (clienteId) => {
  if (!clienteId) throw new Error('clienteId requerido');

  const result = await pool.query(`
    SELECT c.id, c.nombre, c.tier_expiration_date, c.rubro_codigo,
           t.code AS tier_code, t.nombre_publico,
           rt.features AS rubro_features
    FROM cliente c
    LEFT JOIN tier t ON t.id = c.tier_id
    LEFT JOIN rubro_tier rt ON rt.tier_id = c.tier_id AND rt.rubro_codigo = c.rubro_codigo
    WHERE c.id = $1
  `, [clienteId]);

  const row = result.rows[0];
  if (!row) throw new Error('Cliente no encontrado');

  const tierCode = (row.tier_code || 'FREE').toUpperCase();
  const rubroCodigo = row.rubro_codigo || 'gastronomia';
  const features = resolverFeatures({ tierCode, rubroCodigo, rubroFeatures: row.rubro_features, clienteId: row.id });

  const isExpired = Boolean(row.tier_expiration_date && new Date(row.tier_expiration_date) < new Date());

  return {
    clienteId: row.id,
    clienteNombre: row.nombre,
    rubroCodigo,
    tierCode,
    tierNombre: row.nombre_publico || tierCode,
    features,
    isExpired,
  };
};

// ─── Oferta por rubro: precio, duración, disponibilidad y features ────────────

const COLS_OFERTA = `t.id AS tier_id, t.id, t.code, t.nombre_publico AS nombre, t.nombre_publico, t.descripcion,
       t.es_personalizado, t.es_activo,
       rt.rubro_codigo, rt.precio_mensual, rt.duracion_meses, rt.disponible, rt.features`;

const aOferta = (r) => r && ({
  ...r,
  id: r.tier_id,
  code: String(r.code).toUpperCase(),
  precio_mensual: Number(r.precio_mensual),
  duracion_meses: Number(r.duracion_meses),
  disponible: r.disponible === true && r.es_activo !== false,
  features: resolverFeatures({ tierCode: String(r.code).toUpperCase(), rubroCodigo: r.rubro_codigo, rubroFeatures: r.features }),
});

/**
 * Lo que cuesta y trae un tier EN un rubro. Única fuente de precio: nadie más
 * lee tier.precio_mensual. Acepta un client de transacción (signup).
 * Devuelve null si el tier o la combinación no existen.
 */
const getOferta = async (rubroCodigo, tier, db = pool) => {
  const porId = Number.isInteger(Number(tier)) && String(tier).trim() !== '';
  const r = await db.query(
    `SELECT ${COLS_OFERTA}
       FROM tier t
       JOIN rubro_tier rt ON rt.tier_id = t.id AND rt.rubro_codigo = $1
      WHERE ${porId ? 't.id = $2::int' : 'UPPER(t.code) = UPPER($2)'}`,
    [rubroCodigo, String(tier)]
  );
  return aOferta(r.rows[0]);
};

/** Catálogo público de un rubro (landing, pantalla de planes). */
const listarOfertas = async (rubroCodigo) => {
  const r = await pool.query(
    `SELECT ${COLS_OFERTA}
       FROM tier t
       JOIN rubro_tier rt ON rt.tier_id = t.id AND rt.rubro_codigo = $1
      WHERE t.es_activo = true
      ORDER BY t.id`,
    [rubroCodigo]
  );
  return r.rows.map(aOferta);
};

/** Para checkout y alta: la oferta tiene que existir y estar disponible. */
const ofertaContratable = async (rubroCodigo, tier, db = pool) => {
  const oferta = await getOferta(rubroCodigo, tier, db);
  if (!oferta) {
    const err = new Error('Plan inválido'); err.status = 400; err.code = 'PLAN_INVALIDO'; throw err;
  }
  if (!oferta.disponible) {
    const err = new Error(`El plan ${oferta.nombre_publico || oferta.code} todavía no está disponible para tu rubro`);
    err.status = 400; err.code = 'PLAN_NO_DISPONIBLE'; throw err;
  }
  return oferta;
};

/**
 * Cómo se cobra una oferta. Lo decide la duración, no el cliente:
 * · 1 mes  → suscripción (preapproval mensual, monto fijo hasta que se cancele)
 * · N > 1  → pago único por el período (precio_mensual = total del período)
 */
const tipoDePago = (oferta) => (Number(oferta?.duracion_meses) > 1 ? 'one_time' : 'subscription');

/** Un tier que no es FREE sólo se contrata pagando: disponible y con precio > 0. */
const esFree = (code) => String(code || '').toUpperCase() === 'FREE';
const esPagable = (oferta) => Boolean(oferta && oferta.disponible && Number(oferta.precio_mensual) > 0);

/**
 * Chequeo de feature para usar dentro de services/routers sin req.user
 * (n8n, micrositio). Lanza un Error con status 403 y code PLAN_INACTIVE si
 * el plan no la incluye o está vencido.
 */
const assertFeature = async (clienteId, featureName) => {
  const plan = await module.exports.getClienteTierAndFeatures(clienteId);
  if (plan.isExpired || !plan.features[featureName]) {
    const err = new Error(
      plan.isExpired
        ? `El plan ${plan.tierCode} está vencido`
        : `El plan ${plan.tierCode} no incluye ${featureName}`
    );
    err.status = 403;
    err.code = 'PLAN_INACTIVE';
    throw err;
  }
  return plan;
};

module.exports = {
  PLAN_FEATURES,
  getClienteTierAndFeatures,
  assertFeature,
  getOferta,
  listarOfertas,
  ofertaContratable,
  resolverFeatures,
  tipoDePago,
  esFree,
  esPagable,
};
