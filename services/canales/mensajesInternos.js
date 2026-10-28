// services/canales/mensajesInternos.js
//
// Lo que el bot le contesta a un USUARIO de Counter (chat vinculado), no a un
// cliente final. Es el punto de enchufe del harness interno: cuando exista,
// `responder` le pasa { clienteId, userId, modulos, texto } y devuelve su
// respuesta. El canal es sólo transporte: acá no se resuelven intents.
//
// `usuario` ya viene validado como staff activo del comercio (canalesService).

const harness = require('../harness/core/manejarTurno');

const nombreCorto = (nombre) => String(nombre || '').trim().split(/\s+/)[0] || '';

const textoBienvenida = ({ nombre, comercio, recibeAvisos }) => [
  `Listo${nombreCorto(nombre) ? `, ${nombreCorto(nombre)}` : ''}. Vinculaste este Telegram con tu usuario de ${comercio}.`,
  recibeAvisos
    ? 'Desde ahora te aviso acá cada pedido nuevo.'
    : 'Tu usuario no tiene acceso a Pedidos, así que no te voy a mandar avisos de pedidos.',
  '',
  '/pedir — ver el link de pedidos como lo ve un cliente',
  '/desvincular — desconectar este chat',
].join('\n');

/**
 * Respuesta a un mensaje de un usuario vinculado: el harness interno resuelve la
 * consulta ("¿cuánto vendí hoy?"). Si el harness falla, el error sube a
 * canalesService, que lo registra en turn_log (stage 'error').
 */
const responder = async ({ clienteId, usuario, texto }) => {
  const r = await harness.manejarTurno({ clienteId, userId: usuario.user_id, texto });
  return { intent: r.intent, stage: r.stage, ok: r.ok, texto: r.texto };
};

module.exports = { textoBienvenida, responder };
