// validators/passwordPolicy.js
// Misma política que el alta (validators/signupValidator.js), para el cambio
// de contraseña y las contraseñas temporales.
const crypto = require('crypto');

const MIN = 10;
const MAX = 128;

/** Devuelve el motivo por el que la contraseña no sirve, o null si cumple. */
function errorPassword(pwd) {
  if (typeof pwd !== 'string' || pwd.length < MIN) return `La contraseña debe tener al menos ${MIN} caracteres`;
  if (pwd.length > MAX) return `La contraseña no puede superar ${MAX} caracteres`;
  if (!/[a-z]/.test(pwd)) return 'La contraseña debe incluir una minúscula';
  if (!/[A-Z]/.test(pwd)) return 'La contraseña debe incluir una mayúscula';
  if (!/[0-9]/.test(pwd)) return 'La contraseña debe incluir un número';
  return null;
}

// Sin caracteres ambiguos (0/O, 1/l/I): se dicta o se escribe en un papel.
const MAYUS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const MINUS = 'abcdefghijkmnpqrstuvwxyz';
const DIGIT = '23456789';
const TODOS = MAYUS + MINUS + DIGIT;

/** Contraseña temporal de 12 caracteres que cumple la política. */
function generarPasswordTemporal(largo = 12) {
  const pick = (set) => set[crypto.randomInt(set.length)];
  const chars = [pick(MAYUS), pick(MINUS), pick(DIGIT)];
  while (chars.length < largo) chars.push(pick(TODOS));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

module.exports = { errorPassword, generarPasswordTemporal };
