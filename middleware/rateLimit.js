// middleware/rateLimit.js
// Wrapper de express-rate-limit con una sola diferencia: en tests no cuenta.
//
// Sin esto una suite que pegue 6 veces al mismo endpoint público empieza a
// recibir 429 y los tests fallan por la razón equivocada — que es exactamente
// lo que pasaba en tests/signup.test.js.

const rateLimit = require('express-rate-limit');

const enTest = () => process.env.NODE_ENV === 'test';

function crearRateLimit(opciones) {
  return rateLimit({
    standardHeaders: true,
    legacyHeaders: false,
    skip: enTest,
    ...opciones,
  });
}

module.exports = { crearRateLimit };
