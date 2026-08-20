// services/verificacion/estados.js
// Maquina de estados de la cuenta, sobre cliente.estado.
//
//              signup
//                │
//                ▼
//   PENDIENTE_VERIFICACION ──click en el link──> ACTIVO
//                │                                 │
//                │ 30 días sin verificar (cron)    │ impago / abuso
//                ▼                                 ▼
//            BLOQUEADO                         SUSPENDIDO

const ESTADOS = Object.freeze({
  PENDIENTE: 'PENDIENTE_VERIFICACION',
  ACTIVO: 'ACTIVO',
  SUSPENDIDO: 'SUSPENDIDO',
  BLOQUEADO: 'BLOQUEADO',
});

/** Estados que permiten iniciar sesión. */
const PERMITE_LOGIN = new Set([ESTADOS.ACTIVO]);

/**
 * Motivo de rechazo para un estado dado, o null si puede entrar.
 * El mensaje es el que ve el usuario final: nada de nombres de estado crudos.
 */
function motivoRechazo(estado) {
  if (PERMITE_LOGIN.has(estado)) return null;

  switch (estado) {
    case ESTADOS.PENDIENTE:
      return {
        code: 'EMAIL_NO_VERIFICADO',
        error: 'Confirmá tu email antes de entrar. Te mandamos un link a tu casilla.',
      };
    case ESTADOS.SUSPENDIDO:
    case ESTADOS.BLOQUEADO:
      return {
        code: 'CUENTA_INHABILITADA',
        error: 'Tu cuenta está inhabilitada. Escribinos a info@countercrm.com',
      };
    default:
      // Estado desconocido: no adivinamos, no dejamos entrar.
      return {
        code: 'CUENTA_INHABILITADA',
        error: 'Tu cuenta no está disponible. Escribinos a info@countercrm.com',
      };
  }
}

module.exports = { ESTADOS, PERMITE_LOGIN, motivoRechazo };
