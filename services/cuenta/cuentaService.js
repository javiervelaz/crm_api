// services/cuenta/cuentaService.js
//
// Credenciales entregadas por el admin (profesor, tutor, alumno, empleado…)
// y cambio de contraseña. La cuenta nace con contraseña temporal y
// debe_cambiar_password = true: el primer login sólo deja cambiarla
// (middleware/cuentaGuards.js).
const bcrypt = require('bcrypt');
const db = require('../../model/cuenta/db');
const { errorPassword, generarPasswordTemporal } = require('../../validators/passwordPolicy');

const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS ?? 12);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

class CuentaError extends Error {
  constructor(message, { status = 400, code = 'CUENTA_ERROR', field } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.field = field;
  }
}

const getTiposCredencialesService = (cliente_id) => db.getTiposCredenciales(cliente_id);

/**
 * Alta de un usuario con contraseña temporal. Devuelve la contraseña UNA vez:
 * no se guarda en claro en ningún lado, el admin la entrega (a un alumno
 * menor, al tutor).
 */
const crearCredencialesService = async (cliente_id, data) => {
  const nombre = String(data?.nombre ?? '').trim();
  const apellido = String(data?.apellido ?? '').trim();
  const email = String(data?.email ?? '').trim().toLowerCase();
  const tipo = String(data?.tipo ?? '').trim().toUpperCase();
  const telefono = data?.telefono ? String(data.telefono).replace(/\D/g, '') : null;
  const dni = data?.dni ? Number(String(data.dni).replace(/\D/g, '')) || 0 : 0;

  if (nombre.length < 2) throw new CuentaError('Nombre inválido', { field: 'nombre' });
  if (apellido.length < 2) throw new CuentaError('Apellido inválido', { field: 'apellido' });
  if (!EMAIL_RE.test(email)) throw new CuentaError('Email inválido', { field: 'email' });
  if (tipo === 'ADMIN') {
    throw new CuentaError('Los administradores no se crean con credenciales temporales', { code: 'TIPO_INVALIDO', field: 'tipo' });
  }

  const userType = await db.getUserTypeDelRubro(cliente_id, tipo);
  if (!userType) {
    throw new CuentaError('Ese tipo de usuario no está disponible para tu negocio', { code: 'TIPO_INVALIDO', field: 'tipo' });
  }
  if (await db.emailExiste(email)) {
    throw new CuentaError('Ya existe un usuario con ese email', { status: 409, code: 'EMAIL_TAKEN', field: 'email' });
  }

  const passwordTemporal = generarPasswordTemporal();
  const passwordHash = await bcrypt.hash(passwordTemporal, BCRYPT_ROUNDS);

  const user = await db.crearUser({ nombre, apellido, email, user_type_id: userType.id, cliente_id });
  await db.crearProfile({
    id_user: user.id,
    dni,
    telefono,
    passwordHash,
    legajo: `${userType.codigo}-${user.id}`,
    cliente_id,
  });
  const rolId = await db.getOrCreateRol(cliente_id, userType);
  await db.asignarRol(user.id, rolId, cliente_id);

  return {
    user: { id: user.id, nombre, apellido, email, tipo: userType.codigo },
    passwordTemporal,
  };
};

/** Nueva contraseña temporal para un usuario del tenant (se olvidó la suya). */
const resetPasswordService = async (cliente_id, id_user, adminUserId) => {
  if (Number(id_user) === Number(adminUserId)) {
    throw new CuentaError('Para tu propia contraseña usá "Cambiar contraseña"', { code: 'SELF_RESET' });
  }
  const usuario = await db.getUsuarioConPassword(id_user, cliente_id);
  if (!usuario) throw new CuentaError('Usuario no encontrado', { status: 404, code: 'NOT_FOUND' });
  if (usuario.tipo === 'ADMIN') {
    throw new CuentaError('No se puede resetear la contraseña de un administrador', { code: 'TIPO_INVALIDO' });
  }

  const passwordTemporal = generarPasswordTemporal();
  await db.setPassword(usuario.id, cliente_id, await bcrypt.hash(passwordTemporal, BCRYPT_ROUNDS), true);
  return { user: { id: usuario.id, email: usuario.email, tipo: usuario.tipo }, passwordTemporal };
};

/** Cambio de contraseña del propio usuario. Saca el flag de temporal. */
const cambiarPasswordService = async (cliente_id, id_user, actual, nueva) => {
  if (!actual || !nueva) throw new CuentaError('Completá la contraseña actual y la nueva', { code: 'FALTAN_DATOS' });
  const motivo = errorPassword(nueva);
  if (motivo) throw new CuentaError(motivo, { code: 'PASSWORD_DEBIL', field: 'nueva' });
  if (actual === nueva) {
    throw new CuentaError('La nueva contraseña tiene que ser distinta de la actual', { code: 'PASSWORD_REPETIDA', field: 'nueva' });
  }

  const usuario = await db.getUsuarioConPassword(id_user, cliente_id);
  if (!usuario) throw new CuentaError('Usuario no encontrado', { status: 404, code: 'NOT_FOUND' });
  // 400 y no 401: el usuario SÍ está autenticado, y el front trata cualquier 401 como sesión vencida (logout).
  if (!(await bcrypt.compare(actual, usuario.password))) {
    throw new CuentaError('La contraseña actual no es correcta', { status: 400, code: 'PASSWORD_INCORRECTA', field: 'actual' });
  }

  await db.setPassword(usuario.id, cliente_id, await bcrypt.hash(nueva, BCRYPT_ROUNDS), false);
};

module.exports = {
  CuentaError,
  getTiposCredencialesService,
  crearCredencialesService,
  resetPasswordService,
  cambiarPasswordService,
};
