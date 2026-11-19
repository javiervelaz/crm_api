// services/cliente/cuitService.js — CUIT diferido: el alta no lo pide, pero hace
// falta antes del primer pedido.
const cuitDb = require('../../model/cliente/cuit');
const { cuitValido } = require('../../validators/signupValidator');

class CuitError extends Error {
  constructor(message, { status = 400, code = 'CUIT_INVALIDO' } = {}) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const estado = async (clienteId) => ({ cuitCargado: !!(await cuitDb.getCuit(clienteId)) });

const cargar = async (clienteId, cuit) => {
  if (!cuitValido(cuit)) throw new CuitError('CUIT inválido');
  const norm = String(cuit).replace(/\D/g, '');
  if (await cuitDb.getCuit(clienteId)) {
    throw new CuitError('Este comercio ya tiene un CUIT cargado. Para cambiarlo, escribinos.', { status: 409, code: 'CUIT_YA_CARGADO' });
  }
  if (await cuitDb.cuitTomado(norm, clienteId)) {
    throw new CuitError('Ya existe una cuenta con ese CUIT', { status: 409, code: 'CUIT_TAKEN' });
  }
  try {
    const ok = await cuitDb.setCuitSiVacio(clienteId, norm);
    if (!ok) throw new CuitError('Este comercio ya tiene un CUIT cargado.', { status: 409, code: 'CUIT_YA_CARGADO' });
  } catch (err) {
    // Carrera contra el índice único: dos comercios cargando el mismo CUIT a la vez.
    if (err.code === '23505') throw new CuitError('Ya existe una cuenta con ese CUIT', { status: 409, code: 'CUIT_TAKEN' });
    throw err;
  }
  return { cuitCargado: true };
};

module.exports = { estado, cargar, CuitError };
