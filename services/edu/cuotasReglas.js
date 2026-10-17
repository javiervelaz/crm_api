// services/edu/cuotasReglas.js
//
// Reglas puras de cuotas (sin base ni red): config, descuento por cantidad de
// instrumentos, cuota proporcional del mes de alta, vencimiento y recargo.
// Se testean sin stubs. Las fechas son 'YYYY-MM-DD' y los días de la semana
// ISO (1 = lunes … 7 = domingo), igual que edu_inscripcion_horario.

const DEFAULT_CONFIG = Object.freeze({
  dia_vencimiento: 10,
  recargos: [
    { desde_dia: 11, porcentaje: 15 },
    { desde_dia: 21, porcentaje: 25 },
  ],
  descuento_multi_clase: {
    tipo: 'porcentaje',
    escalones: [
      { desde_instrumentos: 2, porcentaje: 25 },
      { desde_instrumentos: 3, porcentaje: 30 },
    ],
    tope: 30,
  },
});

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const pctValido = (n) => Number.isFinite(n) && n >= 0 && n <= 100;

/**
 * Config efectiva del módulo alumnos. Tolera config vieja o incompleta:
 * - sin `escalones` pero con `valor` (migración 015) → ese % desde el 2º instrumento;
 * - sin nada → los valores por defecto del rubro.
 */
const normalizarConfig = (raw) => {
  const c = raw && typeof raw === 'object' ? raw : {};
  const dia = Number(c.dia_vencimiento);
  const dia_vencimiento = Number.isInteger(dia) && dia >= 1 && dia <= 28 ? dia : DEFAULT_CONFIG.dia_vencimiento;

  const recargosIn = Array.isArray(c.recargos) ? c.recargos : DEFAULT_CONFIG.recargos;
  const recargos = recargosIn
    .map((r) => ({ desde_dia: Number(r?.desde_dia), porcentaje: Number(r?.porcentaje) }))
    .filter((r) => Number.isInteger(r.desde_dia) && r.desde_dia >= 1 && r.desde_dia <= 31 && pctValido(r.porcentaje))
    .sort((a, b) => a.desde_dia - b.desde_dia);

  const d = c.descuento_multi_clase && typeof c.descuento_multi_clase === 'object' ? c.descuento_multi_clase : null;
  let descuento;
  if (d && Array.isArray(d.escalones)) {
    const escalones = d.escalones
      .map((e) => ({ desde_instrumentos: Number(e?.desde_instrumentos), porcentaje: Number(e?.porcentaje) }))
      .filter((e) => Number.isInteger(e.desde_instrumentos) && e.desde_instrumentos >= 2 && pctValido(e.porcentaje))
      .sort((a, b) => a.desde_instrumentos - b.desde_instrumentos);
    const tope = Number(d.tope);
    descuento = { tipo: 'porcentaje', escalones, tope: pctValido(tope) ? tope : 100 };
  } else if (d && d.valor !== undefined && pctValido(Number(d.valor))) {
    const valor = Number(d.valor);
    descuento = {
      tipo: 'porcentaje',
      escalones: valor > 0 ? [{ desde_instrumentos: 2, porcentaje: valor }] : [],
      tope: valor,
    };
  } else {
    descuento = DEFAULT_CONFIG.descuento_multi_clase;
  }
  return { dia_vencimiento, recargos, descuento_multi_clase: descuento };
};

// ─── Fechas ──────────────────────────────────────────────────────────────
const aUTC = (iso) => new Date(`${iso}T00:00:00Z`);
const aISO = (d) => d.toISOString().slice(0, 10);
const primerDia = (iso) => `${iso.slice(0, 7)}-01`;
const ultimoDia = (periodo) => {
  const d = aUTC(periodo);
  return aISO(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
};
const mesDe = (iso) => iso.slice(0, 7);
const mesSiguiente = (periodo) => {
  const d = aUTC(periodo);
  return aISO(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)));
};
/** Períodos (primer día de mes) de `desde` a `hasta`, ambos inclusive. */
const periodosEntre = (desde, hasta) => {
  const out = [];
  for (let p = primerDia(desde); p <= primerDia(hasta); p = mesSiguiente(p)) out.push(p);
  return out;
};
const diaISO = (iso) => {
  const w = aUTC(iso).getUTCDay(); // 0 = domingo
  return w === 0 ? 7 : w;
};

/** Clases de una inscripción entre dos fechas (inclusive): una por cada día que coincide con un horario. */
const contarClases = (horarios, desde, hasta) => {
  const dias = new Map();
  for (const h of horarios ?? []) dias.set(Number(h.dia_semana), (dias.get(Number(h.dia_semana)) ?? 0) + 1);
  let n = 0;
  for (let d = aUTC(desde); aISO(d) <= hasta; d = new Date(d.getTime() + 86_400_000)) {
    n += dias.get(diaISO(aISO(d))) ?? 0;
  }
  return n;
};

// ─── Importes ────────────────────────────────────────────────────────────
/** Mes de alta: la cuota mensual dividida por las clases del mes, por las que quedan desde el alta. */
const cuotaProporcional = (importeMensual, clasesMes, clasesCobradas) => {
  if (!clasesMes || clasesCobradas >= clasesMes) return round2(importeMensual);
  return round2((Number(importeMensual) * clasesCobradas) / clasesMes);
};

/** % de descuento para un alumno con `n` instrumentos activos en el mes. */
const porcentajeDescuento = (n, cfg) => {
  const d = cfg.descuento_multi_clase;
  let pct = 0;
  for (const e of d.escalones) if (n >= e.desde_instrumentos) pct = e.porcentaje;
  return Math.min(pct, d.tope);
};

/**
 * Descuento por inscripción de un mismo alumno. El instrumento de alta más
 * antigua es el principal (sin descuento); los demás, de alta más reciente,
 * llevan el % que corresponde a la cantidad total. Empate de alta → menor id.
 * items: [{ id, fecha_alta }] → Map id → pct.
 */
const asignarDescuentos = (items, cfg) => {
  const orden = [...items].sort((a, b) => (a.fecha_alta === b.fecha_alta ? a.id - b.id : a.fecha_alta < b.fecha_alta ? -1 : 1));
  const pct = porcentajeDescuento(orden.length, cfg);
  return new Map(orden.map((it, i) => [it.id, i === 0 ? 0 : pct]));
};

/** Vencimiento: el día configurado; si el alta es posterior, vence el día del alta. */
const vencimientoDe = (periodo, fechaAlta, cfg) => {
  const tope = Number(ultimoDia(periodo).slice(8));
  const dia = String(Math.min(cfg.dia_vencimiento, tope)).padStart(2, '0');
  const base = `${periodo.slice(0, 7)}-${dia}`;
  return fechaAlta && mesDe(fechaAlta) === mesDe(periodo) && fechaAlta > base ? fechaAlta : base;
};

/**
 * Recargo (%) de una cuota según la fecha de pago.
 * - Hasta el vencimiento: 0.
 * - En el mismo mes: escalón por día del mes (11 → 15%, 21 → 25%), corrido por
 *   los días que el vencimiento se atrasó respecto del configurado (altas tardías).
 * - En un mes posterior: el último escalón, fijo. Lo impago no acumula.
 */
const recargoPct = ({ periodo, vence }, fechaPago, cfg) => {
  if (fechaPago <= vence) return 0;
  const escalones = cfg.recargos;
  if (!escalones.length) return 0;
  if (mesDe(fechaPago) > mesDe(periodo)) return escalones[escalones.length - 1].porcentaje;
  const corrimiento = Number(vence.slice(8)) - cfg.dia_vencimiento;
  const dia = Number(fechaPago.slice(8)) - corrimiento;
  let pct = 0;
  for (const e of escalones) if (dia >= e.desde_dia) pct = e.porcentaje;
  return pct;
};

/** Arma las líneas de un pago: cuota + recargo calculado sobre la fecha de pago. */
const calcularLineas = (cuotas, fechaPago, cfg) => {
  const lineas = cuotas.map((c) => {
    const importe = round2(c.importe);
    const pct = recargoPct(c, fechaPago, cfg);
    const recargo = round2((importe * pct) / 100);
    return { cuota_id: c.id, importe, recargo_pct: pct, recargo_importe: recargo, total: round2(importe + recargo) };
  });
  return { lineas, total: round2(lineas.reduce((s, l) => s + l.total, 0)) };
};

/** ¿Se sube después del vencimiento de alguna de las cuotas? */
const fueraDeTermino = (cuotas, fecha) => cuotas.some((c) => fecha > c.vence);

// ─── Comprobantes ────────────────────────────────────────────────────────
const MIME_COMPROBANTE = Object.freeze({
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
});

/** Tipo real del archivo por su firma (no se confía en el mimetype del cliente). */
const detectarTipo = (buf) => {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  if (buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  return null;
};

module.exports = {
  DEFAULT_CONFIG,
  MIME_COMPROBANTE,
  round2,
  normalizarConfig,
  primerDia,
  ultimoDia,
  mesDe,
  mesSiguiente,
  periodosEntre,
  contarClases,
  cuotaProporcional,
  porcentajeDescuento,
  asignarDescuentos,
  vencimientoDe,
  recargoPct,
  calcularLineas,
  fueraDeTermino,
  detectarTipo,
};
