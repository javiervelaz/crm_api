// tests/planClienteInexistente.test.js — token válido de un comercio borrado:
// la API responde 401 (sesión inválida), no 500.
const sinon = require('sinon');
const pool = require('../pool');
const planService = require('../services/cliente/planService');

let expect;
before(async () => { ({ expect } = await import('chai')); });
afterEach(() => sinon.restore());

describe('planService — comercio inexistente', () => {
  it('getClienteTierAndFeatures rechaza con code CLIENTE_NO_ENCONTRADO', async () => {
    sinon.stub(pool, 'query').resolves({ rows: [] });
    let error;
    try { await planService.getClienteTierAndFeatures(999999); } catch (e) { error = e; }
    expect(error).to.be.an('error');
    expect(error.code).to.equal('CLIENTE_NO_ENCONTRADO');
  });
});
