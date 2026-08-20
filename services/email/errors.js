// services/email/errors.js

/**
 * Error de proveedor con clasificacion.
 * permanent = true -> no reintentar (email invalido, dominio inexistente, 4xx).
 * Reintentar un 422 es quemar cuota del proveedor.
 */
class ProviderError extends Error {
  constructor(message, { permanent = false, statusCode = null, provider = null } = {}) {
    super(message);
    this.name = 'ProviderError';
    this.permanent = permanent;
    this.statusCode = statusCode;
    this.provider = provider;
  }
}

module.exports = { ProviderError };
