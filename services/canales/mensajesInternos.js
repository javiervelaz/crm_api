// services/canales/mensajesInternos.js
//
// Lo que el bot le contesta a un USUARIO de Counter (chat vinculado), no a un
// cliente final. Es el punto de enchufe del harness interno: cuando exista,
// `responder` le pasa { clienteId, userId, modulos, texto } y devuelve su
// respuesta. El canal es sólo transporte: acá no se resuelven intents.
//
// `usuario` ya viene validado como staff activo del comercio (canalesService).

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
 * Respuesta a un mensaje de un usuario vinculado.
 * Hoy: ayuda. Con el harness interno: consultas ("¿cuánto vendí hoy?").
 */
const responder = async ({ usuario, comercio }) => {
  const recibeAvisos = usuario.avisos !== false && (usuario.modulos || []).includes('operaciones');
  return {
    intent: 'ayuda',
    texto: [
      `Hola${nombreCorto(usuario.nombre) ? ` ${nombreCorto(usuario.nombre)}` : ''}. Este chat está vinculado a tu usuario de ${comercio}.`,
      recibeAvisos ? 'Acá te llegan los pedidos nuevos.' : 'Tu usuario no recibe avisos de pedidos.',
      'Muy pronto vas a poder preguntarme cosas como "¿cuánto vendí hoy?".',
      '',
      '/pedir — ver el link de pedidos como lo ve un cliente',
      '/desvincular — desconectar este chat',
    ].join('\n'),
  };
};

module.exports = { textoBienvenida, responder };
