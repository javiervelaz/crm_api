// services/harness/core/ventana.js — "hoy", "la semana pasada", "del 1 al 15"…
//
// Parser determinista de expresiones temporales en castellano rioplatense.
// Cero tokens: es un parser, no una decisión. Devuelve el rango en DÍAS LOCALES
// del tenant ('YYYY-MM-DD', ambos inclusive), listo para
//   fechaLocalSql('p.created_at', '$n') BETWEEN $desde AND $hasta
// (utils/fechaTenant.js). "Hoy" lo pone quien llama, con hoyEn(cliente.timezone).
//
// Semana = lunes a domingo. "Esta semana" y "este mes" terminan HOY (no el
// domingo / el 31): es lo que el dueño quiere decir con "en lo que va".
//
// Si el texto no tiene una expresión temporal devuelve null: el intent decide
// su default (casi siempre hoy).

const { normalizar, aNumero, PALABRA_NUMERO } = require('./normalizar');
const { hoyEn, TZ_DEFAULT } = require('../../../utils/fechaTenant');

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
  'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MES_RE = `(${MESES.join('|')}|setiembre)`;
const DIAS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
const DIA_RE = `(${DIAS.join('|')})`;
const N = `(${PALABRA_NUMERO})`;
const ANIO = '(?:\\s+(?:de|del)?\\s*(\\d{4}))?';

// ─── Aritmética de fechas sobre 'YYYY-MM-DD' (UTC puro: sin horas, sin DST) ──
const aDate = (s) => new Date(`${s}T00:00:00Z`);
const aStr = (d) => d.toISOString().slice(0, 10);
const sumarDias = (s, n) => { const d = aDate(s); d.setUTCDate(d.getUTCDate() + n); return aStr(d); };
const diaSemana = (s) => aDate(s).getUTCDay(); // 0 domingo
const lunesDe = (s) => sumarDias(s, -((diaSemana(s) + 6) % 7));
const primeroDeMes = (anio, mes) => `${anio}-${String(mes).padStart(2, '0')}-01`;
const ultimoDeMes = (anio, mes) => aStr(new Date(Date.UTC(anio, mes, 0)));
const partes = (s) => ({ anio: Number(s.slice(0, 4)), mes: Number(s.slice(5, 7)), dia: Number(s.slice(8, 10)) });
const fecha = (anio, mes, dia) => {
  const s = `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
  const d = aDate(s);
  // 31/02 y similares: inválida (Date la corre al mes siguiente)
  return !Number.isNaN(d.getTime()) && aStr(d) === s ? s : null;
};
const numMes = (nombre) => (nombre === 'setiembre' ? 9 : MESES.indexOf(nombre) + 1);
const minStr = (a, b) => (a < b ? a : b);

const etiquetaDia = (s, hoy) => {
  if (s === hoy) return 'hoy';
  if (s === sumarDias(hoy, -1)) return 'ayer';
  const { anio, mes, dia } = partes(s);
  return `el ${dia} de ${MESES[mes - 1]}${anio !== partes(hoy).anio ? ` de ${anio}` : ''}`;
};
const etiquetaMes = (anio, mes, hoy) => `${MESES[mes - 1]}${anio !== partes(hoy).anio ? ` de ${anio}` : ''}`;

/** Año de un mes nombrado sin año: si todavía no llegó este año, es el pasado. */
const anioDeMes = (mes, anioExplicito, hoy) => {
  if (anioExplicito) return Number(anioExplicito);
  const h = partes(hoy);
  return mes > h.mes ? h.anio - 1 : h.anio;
};

/** Día suelto ("el 5", "el 5 de octubre"): si ese día de este mes es futuro, es del mes pasado. */
const resolverDia = (dia, mesNombre, anioExplicito, hoy) => {
  const h = partes(hoy);
  if (mesNombre) {
    const mes = numMes(mesNombre);
    return fecha(anioDeMes(mes, anioExplicito, hoy), mes, dia);
  }
  const esteMes = fecha(h.anio, h.mes, dia);
  if (esteMes && esteMes <= hoy) return esteMes;
  const mesAnt = h.mes === 1 ? 12 : h.mes - 1;
  return fecha(h.mes === 1 ? h.anio - 1 : h.anio, mesAnt, dia);
};

const ddmm = (d, m, a, hoy) => {
  const h = partes(hoy);
  let anio = a ? Number(a) : h.anio;
  if (a && a.length === 2) anio = 2000 + Number(a);
  const s = fecha(anio, Number(m), Number(d));
  // dd/mm sin año que cae en el futuro: el del año pasado
  if (s && !a && s > hoy) return fecha(anio - 1, Number(m), Number(d));
  return s;
};

const rango = (desde, hasta, etiqueta, clave) => (desde && hasta && desde <= hasta ? { desde, hasta, etiqueta, clave } : null);

// El texto nombra una fecha que no existe ("el 31 de septiembre", "del 31 al 5"):
// se corta acá. Seguir con la regla siguiente la convertiría en otra ventana
// ("septiembre") y el bot contestaría con autoridad sobre algo que no se preguntó.
const INVALIDA = Object.freeze({ invalida: true });
const rangoExplicito = (desde, hasta, etiqueta, clave) => rango(desde, hasta, etiqueta, clave) || INVALIDA;

// ─── Reglas, de la más específica a la más general ───────────────────────────
// Cada regla: [regex sobre el texto normalizado, (match, hoy) => rango | null]
const REGLAS = [
  // del 01/10 al 15/10[/2026]
  [/\bdel?\s+(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s+al\s+(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/, (m, hoy) => {
    const desde = ddmm(m[1], m[2], m[3] || m[6], hoy);
    const hasta = ddmm(m[4], m[5], m[6] || m[3], hoy);
    return rangoExplicito(desde, hasta, `del ${m[1]}/${m[2]} al ${m[4]}/${m[5]}`, 'rango');
  }],
  // del 1 al 15 [de octubre [de 2025]]
  [new RegExp(`\\bdel?\\s+${N}\\s+al\\s+${N}(?:\\s+de\\s+${MES_RE}${ANIO})?\\b`), (m, hoy) => {
    const d1 = aNumero(m[1]); const d2 = aNumero(m[2]);
    const h = partes(hoy);
    const mes = m[3] ? numMes(m[3]) : h.mes;
    const anio = m[3] ? anioDeMes(mes, m[4], hoy) : h.anio;
    const desde = fecha(anio, mes, d1);
    const hasta = fecha(anio, mes, d2);
    if (!desde || !hasta || desde > hasta || desde > hoy) return INVALIDA;
    return rango(desde, minStr(hasta, hoy), `del ${d1} al ${d2} de ${MESES[mes - 1]}`, 'rango');
  }],
  // últimos N días / los últimos tres días
  [new RegExp(`\\b(?:los\\s+)?ultimos?\\s+${N}\\s+dias?\\b`), (m, hoy) => {
    const n = aNumero(m[1]);
    if (!n || n > 366) return null;
    return rango(sumarDias(hoy, -(n - 1)), hoy, `los últimos ${n} días`, `ultimos_${n}`);
  }],
  [/\b(?:la\s+)?ultima\s+semana\b/, (m, hoy) => rango(sumarDias(hoy, -6), hoy, 'los últimos 7 días', 'ultimos_7')],
  [/\b(?:el\s+)?ultimo\s+mes\b/, (m, hoy) => rango(sumarDias(hoy, -29), hoy, 'los últimos 30 días', 'ultimos_30')],
  // semana
  [/\b(?:la\s+)?semana\s+pasada\b|\bsemana\s+anterior\b/, (m, hoy) => {
    const lunes = sumarDias(lunesDe(hoy), -7);
    return rango(lunes, sumarDias(lunes, 6), 'la semana pasada', 'semana_pasada');
  }],
  [/\b(?:esta|en\s+la|de\s+la|la)\s+semana\b|\bsemanal\b/, (m, hoy) => rango(lunesDe(hoy), hoy, 'esta semana', 'semana')],
  // mes
  [/\b(?:el\s+)?mes\s+pasado\b|\bmes\s+anterior\b/, (m, hoy) => {
    const h = partes(hoy);
    const mes = h.mes === 1 ? 12 : h.mes - 1;
    const anio = h.mes === 1 ? h.anio - 1 : h.anio;
    return rango(primeroDeMes(anio, mes), ultimoDeMes(anio, mes), 'el mes pasado', 'mes_pasado');
  }],
  [/\b(?:este|en\s+el|del|el)\s+mes\b|\blo\s+que\s+va\s+del\s+mes\b|\bmensual\b/, (m, hoy) => {
    const h = partes(hoy);
    return rango(primeroDeMes(h.anio, h.mes), hoy, 'este mes', 'mes');
  }],
  // año
  [/\b(?:el\s+)?ano\s+pasado\b/, (m, hoy) => {
    const a = partes(hoy).anio - 1;
    return rango(`${a}-01-01`, `${a}-12-31`, `${a}`, 'anio_pasado');
  }],
  [/\b(?:este|en\s+el|del|el)\s+ano\b|\blo\s+que\s+va\s+del\s+ano\b/, (m, hoy) => rango(`${partes(hoy).anio}-01-01`, hoy, 'este año', 'anio')],
  // 15/10[/2026]
  [/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/, (m, hoy) => {
    const s = ddmm(m[1], m[2], m[3], hoy);
    return rangoExplicito(s, s, s ? etiquetaDia(s, hoy) : '', 'dia');
  }],
  // el 5 [de octubre [de 2025]]
  [new RegExp(`\\bel\\s+${N}(?:\\s+de\\s+${MES_RE}${ANIO})?\\b(?!\\s*(?:dias?|productos?|pedidos?|%))`), (m, hoy) => {
    const dia = aNumero(m[1]);
    if (!dia) return null;
    if (dia > 31) return m[2] ? INVALIDA : null; // "el 50" suelto no es una fecha
    const s = resolverDia(dia, m[2], m[3], hoy);
    return rangoExplicito(s, s, s ? etiquetaDia(s, hoy) : '', 'dia');
  }],
  // [en] septiembre [de 2025]
  [new RegExp(`\\b${MES_RE}${ANIO}\\b`), (m, hoy) => {
    const mes = numMes(m[1]);
    const anio = anioDeMes(mes, m[2], hoy);
    const h = partes(hoy);
    const hasta = anio === h.anio && mes === h.mes ? hoy : ultimoDeMes(anio, mes);
    return rango(primeroDeMes(anio, mes), hasta, etiquetaMes(anio, mes, hoy), 'mes_nombrado');
  }],
  // el lunes / el martes pasado (el más reciente ANTES de hoy)
  [new RegExp(`\\b(?:el\\s+)?${DIA_RE}(?:\\s+pasado)?\\b`), (m, hoy) => {
    const objetivo = DIAS.indexOf(m[1]);
    let atras = (diaSemana(hoy) - objetivo + 7) % 7;
    if (atras === 0) atras = 7;
    const s = sumarDias(hoy, -atras);
    return rango(s, s, `el ${m[1].replace('miercoles', 'miércoles').replace('sabado', 'sábado')} ${partes(s).dia}`, 'dia');
  }],
  // anteayer / antes de ayer — antes que "ayer"
  [/\b(?:anteayer|antes\s+de\s+ayer|antier)\b/, (m, hoy) => {
    const s = sumarDias(hoy, -2);
    return rango(s, s, 'anteayer', 'anteayer');
  }],
  [/\bayer\b/, (m, hoy) => { const s = sumarDias(hoy, -1); return rango(s, s, 'ayer', 'ayer'); }],
  [/\bpasado\s+manana\b/, (m, hoy) => { const s = sumarDias(hoy, 2); return { ...rango(s, s, 'pasado mañana', 'pasado_manana'), futuro: true }; }],
  // "esta mañana" / "a la mañana" es HOY a la mañana, no mañana
  [/\b(?:esta|a\s+la|de\s+la|por\s+la)\s+manana\b/, (m, hoy) => rango(hoy, hoy, 'hoy', 'hoy')],
  [/\bmanana\b/, (m, hoy) => { const s = sumarDias(hoy, 1); return { ...rango(s, s, 'mañana', 'manana'), futuro: true }; }],
  [/\bhoy\b|\bdel\s+dia\b|\ben\s+el\s+dia\b|\bhasta\s+ahora\b/, (m, hoy) => rango(hoy, hoy, 'hoy', 'hoy')],
];

/**
 * Ventana temporal del texto.
 * @param {string} texto lo que escribió el usuario (sin normalizar, se normaliza acá)
 * @param {{ hoy?: string, tz?: string }} opciones  hoy en 'YYYY-MM-DD' (tests) o la zona del tenant
 * @returns {{ desde, hasta, etiqueta, clave, futuro?, texto } | { invalida: true, texto } | null}
 */
const parsearVentana = (texto, { hoy, tz = TZ_DEFAULT } = {}) => {
  const base = hoy || hoyEn(tz);
  const t = normalizar(texto);
  for (const [re, fn] of REGLAS) {
    const m = t.match(re);
    if (!m) continue;
    const r = fn(m, base);
    if (r) return { ...r, texto: m[0] };
  }
  return null;
};

/** La ventana del texto o, si no tiene, la que el intent usa por defecto. Una inválida se devuelve tal cual. */
const ventanaODefault = (texto, opciones = {}, porDefecto = 'hoy') =>
  parsearVentana(texto, opciones) || parsearVentana(porDefecto, opciones);

module.exports = { parsearVentana, ventanaODefault, _internos: { sumarDias, lunesDe, ultimoDeMes } };
