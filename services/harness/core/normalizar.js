// services/harness/core/normalizar.js — una sola normalización para todo el
// harness: los patrones del router, el parser de ventanas y la búsqueda de
// entidades ven el MISMO texto. Si cada etapa normaliza distinto, un patrón
// matchea en el test y no en producción.

const NUMEROS = {
  un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8,
  nueve: 9, diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16,
  diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20, treinta: 30,
};

/** minúsculas, sin tildes, sin signos de puntuación (salvo / y -), espacios simples. */
const normalizar = (texto) => String(texto ?? '')
  .toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[¿?¡!.,;:()"'`´]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

/** "tres" → 3, "15" → 15; null si no es un número. */
const aNumero = (s) => {
  if (s == null) return null;
  if (/^\d+$/.test(s)) return Number(s);
  return NUMEROS[s] ?? null;
};

const PALABRA_NUMERO = `(?:\\d{1,3}|${Object.keys(NUMEROS).join('|')})`;

module.exports = { normalizar, aNumero, PALABRA_NUMERO };
