// services/email/providers/index.js

const PROVIDERS = {
  resend: () => require('./resend'),
  smtp: () => require('./smtp'),
  console: () => require('./console'),
};

/**
 * Resuelve el provider por EMAIL_PROVIDER.
 * Default deliberado: 'console' fuera de produccion. Si alguien corre en dev
 * sin configurar nada, los mails van a stdout y no a la casilla de un cliente.
 */
function getProvider(name = process.env.EMAIL_PROVIDER) {
  const key = String(name || (process.env.NODE_ENV === 'production' ? 'resend' : 'console'))
    .trim().toLowerCase();

  const factory = PROVIDERS[key];
  if (!factory) {
    throw new Error(
      `EMAIL_PROVIDER inválido: "${key}". Opciones: ${Object.keys(PROVIDERS).join(', ')}`
    );
  }
  return factory();
}

module.exports = { getProvider, PROVIDERS };
