// services/verificacion/config.js
// Ventanas de la verificación de email. Viven acá y no en el service para que
// clienteService pueda leerlas sin arrastrar el módulo de email entero.

module.exports = {
  // Cuánto vive el link de activación
  TTL_DIAS: Number(process.env.VERIFICACION_TTL_DIAS || 7),
  // A los cuántos días sin verificar la cuenta pasa a BLOQUEADO
  BLOQUEO_DIAS: Number(process.env.VERIFICACION_BLOQUEO_DIAS || 30),
};
