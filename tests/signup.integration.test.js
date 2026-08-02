// tests/signup.integration.test.js
describe('provisioning end-to-end', function () {
  this.timeout(30_000);
  let pool, expect, clienteId;

  before(async function () {
    ({ expect } = await import('chai'));
    if (!process.env.TEST_POSTGRES_URL) return this.skip();
    const { Pool } = require('pg');
    pool = new Pool({ connectionString: process.env.TEST_POSTGRES_URL });
  });

  after(async () => {
    if (clienteId) await pool.query('DELETE FROM cliente WHERE id = $1', [clienteId]);
    await pool?.end();
  });

  it('deja el tenant listo para operar', async () => {
    const ClienteService = require('../services/cliente/clienteService');
    const r = await ClienteService.createClienteService({
      nombre: 'Test ' + Date.now(),
      cuit: String(Date.now()).slice(-11),
      adminNombre: 'Test', adminApellido: 'User',
      adminEmail: `test${Date.now()}@ejemplo.com`,
      adminPassword: 'Contrasena123',
      plan: 'FREE',
    });
    clienteId = r.cliente.id;

    const check = async (sql) => Number((await pool.query(sql, [clienteId])).rows[0].n);

    expect(await check('SELECT COUNT(*)::int n FROM "user" WHERE cliente_id=$1')).to.equal(1);
    expect(await check('SELECT COUNT(*)::int n FROM profile WHERE cliente_id=$1')).to.equal(1);
    expect(await check('SELECT COUNT(*)::int n FROM user_rol WHERE cliente_id=$1')).to.equal(1);
    expect(await check('SELECT COUNT(*)::int n FROM rol WHERE cliente_id=$1')).to.be.greaterThan(0);
    expect(await check('SELECT COUNT(*)::int n FROM modulo WHERE cliente_id=$1')).to.be.greaterThan(0);
    expect(await check('SELECT COUNT(*)::int n FROM permiso WHERE cliente_id=$1')).to.be.greaterThan(0);
    expect(await check('SELECT COUNT(*)::int n FROM rol_permiso WHERE cliente_id=$1')).to.be.greaterThan(0);

    // El login tiene que funcionar con la password que se mandó
    const userService = require('../services/user/userService');
    const authed = await userService.authenticate(r.adminUser.email, 'Contrasena123');
    expect(authed.error).to.be.undefined;
    expect(authed.role).to.include.something.that.matches(/admin/i);
    expect(authed.modules.length).to.be.greaterThan(0);
  });
});