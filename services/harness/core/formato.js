// services/harness/core/formato.js — cómo se le muestra un número al usuario.
//
// Plata: llega de Postgres como string `numeric` y NUNCA pasa por float. Se
// formatea sobre el string (es-AR: $ 1.234.567,50; sin decimales si son ,00).

const moneda = (valor) => {
  const s = String(valor ?? '0').trim();
  const m = s.match(/^(-?)(\d+)(?:\.(\d+))?$/);
  if (!m) throw new Error(`moneda: valor no numérico (${s})`);
  const [, neg, ent, dec = ''] = m;
  const entAgrupado = ent.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const centavos = (dec + '00').slice(0, 2);
  const cuerpo = centavos === '00' ? entAgrupado : `${entAgrupado},${centavos}`;
  return `${neg ? '-' : ''}$ ${cuerpo}`;
};

const entero = (n) => String(Math.trunc(Number(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

const plural = (n, uno, varios) => `${entero(n)} ${Number(n) === 1 ? uno : varios}`;

/** Variación porcentual como texto ("+12 %", "-8 %"); null si la base es 0. */
const variacion = (actual, base) => {
  const a = Number(actual); const b = Number(base);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return null;
  const p = Math.round(((a - b) / b) * 100);
  return `${p > 0 ? '+' : ''}${p} %`;
};

/** Cantidad de stock legible: "2,5 kg", "800 g", "12 u". Menos de 1 kg o 1 l va en g o ml. */
const cantidad = (valor, unidad) => {
  const n = Number(valor);
  if (!Number.isFinite(n)) throw new Error(`cantidad: valor no numérico (${valor})`);
  const fmt = (x, max) => x.toLocaleString('es-AR', { maximumFractionDigits: max, minimumFractionDigits: 0 });
  if ((unidad === 'kg' || unidad === 'l') && n !== 0 && Math.abs(n) < 1) {
    return `${fmt(n * 1000, 0)} ${unidad === 'kg' ? 'g' : 'ml'}`;
  }
  return `${fmt(n, 3)} ${unidad}`;
};

module.exports = { moneda, entero, plural, variacion, cantidad };
