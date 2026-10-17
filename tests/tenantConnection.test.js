const assert = require('assert');
const { EventEmitter } = require('events');
const pg = require('pg');

// Pool falso: connect() se resuelve cuando el test lo decide, para reproducir
// el cierre del request mientras espera conexión.
class FakeClient {
  constructor() { this.queries = []; this.released = 0; }
  async query(sql) { this.queries.push(typeof sql === 'string' ? sql : sql.text); return { rows: [] }; }
  release() { this.released++; }
}
let pendientes = [];
class FakePool {
  connect() { return new Promise((resolve) => pendientes.push(resolve)); }
}

const cargar = () => {
  const Orig = pg.Pool;
  pg.Pool = FakePool;
  delete require.cache[require.resolve('../middleware/tenantConnection')];
  const mod = require('../middleware/tenantConnection');
  pg.Pool = Orig;
  return mod;
};
const tick = () => new Promise((r) => setImmediate(r));
const nuevoRes = () => Object.assign(new EventEmitter(), { statusCode: 200 });

describe('withTenantConnection', () => {
  let withTenantConnection;
  let getStore;
  before(() => {
    ({ withTenantConnection } = cargar());
    ({ getStore } = require('../tenantContext'));
  });
  beforeEach(() => { pendientes = []; });

  const correr = (res) => new Promise((resolve) => {
    withTenantConnection({ clienteId: 7 }, res, () => resolve(getStore()));
  });

  it('request que nunca consulta no toma conexión', async () => {
    const res = nuevoRes();
    await correr(res);
    res.emit('finish'); res.emit('close');
    await tick();
    assert.strictEqual(pendientes.length, 0);
  });

  it('commit y release al terminar con 2xx', async () => {
    const res = nuevoRes();
    const store = await correr(res);
    const p = store.getClient();
    const c = new FakeClient(); pendientes[0](c);
    await p;
    res.emit('finish'); res.emit('close');
    await tick();
    assert.deepStrictEqual(c.queries.slice(-1), ['COMMIT']);
    assert.strictEqual(c.released, 1);
  });

  it('rollback con 4xx/5xx', async () => {
    const res = nuevoRes(); res.statusCode = 409;
    const store = await correr(res);
    const p = store.getClient();
    const c = new FakeClient(); pendientes[0](c);
    await p;
    res.emit('finish');
    await tick();
    assert.deepStrictEqual(c.queries.slice(-1), ['ROLLBACK']);
    assert.strictEqual(c.released, 1);
  });

  it('cliente que corta mientras espera conexión: la conexión se libera igual (no queda colgada)', async () => {
    const res = nuevoRes();
    const store = await correr(res);
    const p = store.getClient().catch((e) => e);
    res.emit('close'); // el navegador abortó (navegación, timeout)
    await tick();
    const c = new FakeClient(); pendientes[0](c); // el pool recién ahora entrega la conexión
    await p;
    await tick(); await tick();
    assert.strictEqual(c.released, 1, 'la conexión quedó tomada para siempre');
    assert.strictEqual(c.queries.includes('COMMIT'), false);
  });

  it('después del cierre no se abre otra conexión ni se reusa la liberada', async () => {
    const res = nuevoRes();
    const store = await correr(res);
    const p = store.getClient();
    const c = new FakeClient(); pendientes[0](c);
    await p;
    res.emit('finish'); res.emit('close');
    await tick();
    await assert.rejects(store.getClient(), /cerrado/);
    assert.strictEqual(pendientes.length, 1);
  });

  it('falla en BEGIN: libera y propaga', async () => {
    const res = nuevoRes();
    const store = await correr(res);
    const p = store.getClient().catch((e) => e);
    const c = new FakeClient();
    c.query = async () => { throw new Error('boom'); };
    pendientes[0](c);
    const err = await p;
    assert.match(err.message, /boom/);
    res.emit('finish'); res.emit('close');
    await tick();
    assert.strictEqual(c.released, 1);
  });
});
