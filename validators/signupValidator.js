// validators/signupValidator.js
const { body, validationResult } = require('express-validator');

// Validación real de CUIT: dígito verificador módulo 11.
// Sin esto se registra cualquier número de 11 dígitos.
function cuitValido(cuit) {
  const c = String(cuit).replace(/\D/g, '');
  if (c.length !== 11) return false;

  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const suma = pesos.reduce((acc, p, i) => acc + p * Number(c[i]), 0);
  const resto = suma % 11;
  const dv = resto === 0 ? 0 : resto === 1 ? 9 : 11 - resto;

  return dv === Number(c[10]);
}

const signupRules = [
  body('comercioNombre').trim().isLength({ min: 2, max: 120 })
    .withMessage('El nombre del comercio debe tener entre 2 y 120 caracteres'),

  body('cuit').custom((v) => cuitValido(v) || Promise.reject('CUIT inválido')),

  body('adminNombre').trim().isLength({ min: 2, max: 60 }).withMessage('Nombre inválido'),
  body('adminApellido').trim().isLength({ min: 2, max: 60 }).withMessage('Apellido inválido'),

  body('adminEmail').trim().isEmail().normalizeEmail().withMessage('Email inválido'),

  body('password')
    .isLength({ min: 10, max: 128 }).withMessage('La contraseña debe tener al menos 10 caracteres')
    .matches(/[a-z]/).withMessage('La contraseña debe incluir una minúscula')
    .matches(/[A-Z]/).withMessage('La contraseña debe incluir una mayúscula')
    .matches(/[0-9]/).withMessage('La contraseña debe incluir un número'),

  // Formato AR: 10-13 dígitos (con o sin 54 / 9 / 0 / 15)
  body('telefono').optional({ values: 'falsy' })
    .customSanitizer((v) => String(v).replace(/\D/g, ''))
    .isLength({ min: 10, max: 13 }).withMessage('Teléfono inválido'),

  body('adminDni').optional({ values: 'falsy' })
    .customSanitizer((v) => String(v).replace(/\D/g, ''))
    .isLength({ min: 7, max: 8 }).withMessage('DNI inválido'),

  body('plan').optional().toUpperCase()
    .isIn(['FREE', 'BASIC', 'PREMIUM', 'CUSTOM']).withMessage('Plan inválido'),

  body('aceptaTerminos').equals('true')
    .withMessage('Debés aceptar los términos y condiciones'),
];

const handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) return next();

  const first = errors.array()[0];
  res.status(400).json({
    error: first.msg,
    field: first.path,
    code: 'VALIDATION_ERROR',
    errors: errors.array().map((e) => ({ field: e.path, message: e.msg })),
  });
};

module.exports = { signupRules, handleValidation, cuitValido };