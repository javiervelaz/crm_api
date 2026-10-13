// tests/rubros.test.js
// feat/core-modulos: rubros como plantilla de alta + módulos por tenant.
const request = require('supertest');
const sinon = require('sinon');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-tests';
const app = require('../node');
const pool = require('../pool');
const ClienteService = require('../services/cliente/clienteService');
const ModuloService = require('../services/modulo/moduloService');
const moduloDb = require('../model/modulos/db');
const mailer = require('../services/email');

const PLATFORM_TOKEN = process.env.PLATFORM_ADMIN_TOKEN;

const SIGNUP_VALIDO = {
  comercioNombre: 'Academia Do Re Mi',
  cuit: '30712345671',
  adminNombre: 'Ana',
  adminApellido: 'Paz',
  adminEmail: 'ana@ejemplo.com',
  password: 'Contrasena123',
  aceptaTerminos: 'true',
  plan: 'FREE',
};

let expect;
before(async () => { ({ expect } = await import('chai')); });
afterEach(() => sinon.restore());

// ─── Fake de client transaccional para createClienteService ────────────────
// Responde según el texto del SQL y registra cada query para inspeccionarlas.
function fakeClient({ rubroActivo = true, userTypes, modulosMaestro } = {}) {
  const calls = [];
  let nextId = 100;
  const client = {
    calls,
    release: sinon.spy(),
    query: async (sql, params = []) => {
      calls.push({ sql, params });
      const s = String(sql);
      if (/^(BEGIN|COMMIT|ROLLBACK)/.test(s.trim())) return { rows: [] };
      if (s.includes('AS cuit_taken')) return { rows: [{ cuit_taken: false, email_taken: false }] };
      if (s.includes('FROM tier')) return { rows: [{ id: 1, code: 'FREE', precio_mensual: 0, duracion_meses: 1 }] };
      if (s.includes('FROM rubro WHERE')) {
        return { rows: rubroActivo ? [{ codigo: params[0], nombre: 'Rubro ' + params[0] }] : [] };
      }
      if (s.includes('INSERT INTO cliente')) return { rows: [{ id: 77, nombre: params[0], rubro_codigo: params[15] }] };
      if (s.includes('FROM user_type')) {
        return { rows: userTypes ?? [{ id: 1, codigo: 'ADMIN', descripcion: 'admin' }, { id: 2, codigo: 'EMP', descripcion: 'empleado' }] };
      }
      if (s.includes('INSERT INTO "user"')) return { rows: [{ id: 10, nombre: params[0], apellido: params[1], email: params[2] }] };
      if (s.includes('INSERT INTO rol ')) return { rows: [{ id: nextId++, descripcion: params[0] }] };
      if (s.includes('INSERT INTO legajo_secuencia')) return { rows: [{ ultimo: 1 }] };
      if (s.includes('FROM modulo_maestro')) {
        return {
          rows: modulosMaestro ?? [
            { codigo: 'usuarios', descripcion: 'Usuarios', status: true, config_default: {} },
            { codigo: 'gasto', descripcion: 'Gastos', status: true, config_default: { dia_vencimiento: 10 } },
          ],
        };
      }
      if (s.includes('INSERT INTO modulo ')) {
        return { rows: [{ id: nextId++, codigo: params[0], descripcion: params[1], config: params[4] }] };
      }
      if (s.includes('FROM permiso_accion')) return { rows: [{ id: 1, codigo: 'list', descripcion: 'ver' }] };
      if (s.includes('INSERT INTO permiso ')) return { rows: params[0].map((_, i) => ({ id: 500 + i })) };
      return { rows: [] };
    },
  };
  return client;
}

const ALTA = {
  nombre: 'Academia', cuit: '30712345671', adminNombre: 'Ana', adminApellido: 'Paz',
  adminEmail: 'ana@ejemplo.com', adminPassword: 'Contrasena123', plan: 'FREE',
};

describe('createClienteService con rubros', () => {
  beforeEach(() => sinon.stub(mailer, 'enqueue').resolves({ id: 1 }));

  it('sin rubro usa gastronomia (comportamiento histórico)', async () => {
    const client = fakeClient();
    sinon.stub(pool, 'connect').resolves(client);

    const r = await ClienteService.createClienteService(ALTA);

    const rubroQ = client.calls.find((c) => c.sql.includes('FROM rubro WHERE'));
    expect(rubroQ.params).to.deep.equal(['gastronomia']);
    expect(r.cliente.rubro_codigo).to.equal('gastronomia');
  });

  it('normaliza el rubro y filtra user_types y módulos por ese rubro', async () => {
    const client = fakeClient();
    sinon.stub(pool, 'connect').resolves(client);

    await ClienteService.createClienteService({ ...ALTA, rubro: '  Educacion ' });

    const ut = client.calls.find((c) => c.sql.includes('FROM user_type'));
    const mm = client.calls.find((c) => c.sql.includes('FROM modulo_maestro'));
    expect(ut.sql).to.include('rubro_user_type');
    expect(ut.params).to.deep.equal(['educacion']);
    expect(mm.sql).to.include('rubro_modulo_maestro');
    expect(mm.params).to.deep.equal(['educacion']);
  });

  it('copia config_default del rubro a modulo.config', async () => {
    const client = fakeClient();
    sinon.stub(pool, 'connect').resolves(client);

    await ClienteService.createClienteService({ ...ALTA, rubro: 'educacion' });

    const inserts = client.calls.filter((c) => c.sql.includes('INSERT INTO modulo '));
    const gasto = inserts.find((c) => c.params[0] === 'gasto');
    expect(gasto.params[4]).to.deep.equal({ dia_vencimiento: 10 });
  });

  it('crea un rol por user_type del rubro y sólo esos', async () => {
    const client = fakeClient();
    sinon.stub(pool, 'connect').resolves(client);

    const r = await ClienteService.createClienteService({ ...ALTA, rubro: 'educacion' });

    expect(r.roles.map((x) => x.descripcion)).to.deep.equal(['admin', 'empleado']);
  });

  it('rubro inexistente o inactivo → 400 RUBRO_INVALIDO y ROLLBACK', async () => {
    const client = fakeClient({ rubroActivo: false });
    sinon.stub(pool, 'connect').resolves(client);
    sinon.stub(console, 'error');

    let err;
    try { await ClienteService.createClienteService({ ...ALTA, rubro: 'gimnasio' }); } catch (e) { err = e; }

    expect(err).to.be.instanceOf(ClienteService.SignupError);
    expect(err.status).to.equal(400);
    expect(err.code).to.equal('RUBRO_INVALIDO');
    expect(err.field).to.equal('rubro');
    expect(client.calls.some((c) => /ROLLBACK/.test(c.sql))).to.equal(true);
    expect(client.calls.some((c) => c.sql.includes('INSERT INTO cliente'))).to.equal(false);
    expect(client.release.calledOnce).to.equal(true);
  });

  it('rubro sin módulos configurados → 500 y ROLLBACK', async () => {
    const client = fakeClient({ modulosMaestro: [] });
    sinon.stub(pool, 'connect').resolves(client);
    sinon.stub(console, 'error');

    let err;
    try { await ClienteService.createClienteService({ ...ALTA, rubro: 'educacion' }); } catch (e) { err = e; }

    expect(err.status).to.equal(500);
    expect(client.calls.some((c) => /ROLLBACK/.test(c.sql))).to.equal(true);
  });

  it('rubro sin user_type ADMIN → 500', async () => {
    const client = fakeClient({ userTypes: [{ id: 2, codigo: 'EMP', descripcion: 'empleado' }] });
    sinon.stub(pool, 'connect').resolves(client);
    sinon.stub(console, 'error');

    let err;
    try { await ClienteService.createClienteService({ ...ALTA, rubro: 'educacion' }); } catch (e) { err = e; }

    expect(err.status).to.equal(500);
  });
});

describe('POST /api/signup con rubro', () => {
  const stubProvisioning = () => sinon.stub(ClienteService, 'createClienteService').resolves({
    cliente: { id: 1, nombre: 'Academia', rubro_codigo: 'educacion' },
    tier: { id: 1, code: 'FREE', precio_mensual: 0, duracion_meses: 0 },
    rubro: { codigo: 'educacion', nombre: 'Educación' },
    esPago: false,
    adminUser: { id: 10, email: SIGNUP_VALIDO.adminEmail, cliente_id: 1 },
    roles: [], modulos: [],
  });

  beforeEach(() => sinon.stub(mailer, 'drain').resolves({ sent: 0, failed: 0, retry: 0, procesados: 0 }));

  it('pasa el rubro al provisioning', async () => {
    const stub = stubProvisioning();
    const res = await request(app).post('/api/signup').send({ ...SIGNUP_VALIDO, rubro: 'Educacion' });

    expect(res.status).to.equal(201);
    expect(stub.firstCall.args[0].rubro).to.equal('educacion');
  });

  it('sin rubro no rompe el alta actual', async () => {
    const stub = stubProvisioning();
    const res = await request(app).post('/api/signup').send(SIGNUP_VALIDO);

    expect(res.status).to.equal(201);
    expect(stub.firstCall.args[0].rubro).to.equal(undefined);
  });

  it('rechaza un rubro con formato inválido sin llegar al service', async () => {
    const stub = stubProvisioning();
    const res = await request(app).post('/api/signup').send({ ...SIGNUP_VALIDO, rubro: "x'; DROP TABLE cliente;--" });

    expect(res.status).to.equal(400);
    expect(res.body.field).to.equal('rubro');
    expect(stub.called).to.equal(false);
  });

  it('propaga RUBRO_INVALIDO del service como 400', async () => {
    sinon.stub(ClienteService, 'createClienteService').rejects(
      new ClienteService.SignupError('El rubro elegido no es válido', { code: 'RUBRO_INVALIDO', field: 'rubro' })
    );
    const res = await request(app).post('/api/signup').send({ ...SIGNUP_VALIDO, rubro: 'gimnasio' });

    expect(res.status).to.equal(400);
    expect(res.body.code).to.equal('RUBRO_INVALIDO');
  });
});

describe('GET /api/rubros', () => {
  it('es público y devuelve los rubros activos', async () => {
    const stub = sinon.stub(pool, 'query').resolves({
      rows: [{ codigo: 'educacion', nombre: 'Educación' }, { codigo: 'gastronomia', nombre: 'Gastronomía' }],
    });
    const res = await request(app).get('/api/rubros');

    expect(res.status).to.equal(200);
    expect(res.body).to.have.length(2);
    expect(stub.firstCall.args[0]).to.include('activo = true');
  });
});

describe('Módulos fuera del rubro del tenant', () => {
  it('createModuloService rechaza un código que no es del rubro', async () => {
    sinon.stub(moduloDb, 'isCodigoEnRubroDelCliente').resolves(false);
    const create = sinon.stub(moduloDb, 'createModulo');

    let err;
    try {
      await ModuloService.createModuloService({ codigo: 'productos', descripcion: 'x', status: true, cliente_id: 5 });
    } catch (e) { err = e; }

    expect(err.status).to.equal(400);
    expect(err.code).to.equal('MODULO_FUERA_DE_RUBRO');
    expect(create.called).to.equal(false);
  });

  it('createModuloService acepta un código del rubro', async () => {
    sinon.stub(moduloDb, 'isCodigoEnRubroDelCliente').resolves(true);
    sinon.stub(moduloDb, 'createModulo').resolves({ id: 1, codigo: 'usuarios' });

    const r = await ModuloService.createModuloService({ codigo: 'usuarios', descripcion: 'x', status: true, cliente_id: 5 });
    expect(r.codigo).to.equal('usuarios');
  });

  it('updateModuloService no permite renombrar a un código de otro rubro', async () => {
    sinon.stub(moduloDb, 'isCodigoEnRubroDelCliente').resolves(false);
    const update = sinon.stub(moduloDb, 'updateModulo');

    let err;
    try { await ModuloService.updateModuloService(3, { codigo: 'alumnos', cliente_id: 5 }); } catch (e) { err = e; }

    expect(err.code).to.equal('MODULO_FUERA_DE_RUBRO');
    expect(update.called).to.equal(false);
  });

  it('updateModuloService sin código (sólo status/descripcion) no consulta el catálogo', async () => {
    const check = sinon.stub(moduloDb, 'isCodigoEnRubroDelCliente');
    sinon.stub(moduloDb, 'updateModulo').resolves({ id: 3, status: false });

    await ModuloService.updateModuloService(3, { status: false, cliente_id: 5 });
    expect(check.called).to.equal(false);
  });
});

describe('/api/platform — módulos de un tenant', () => {
  const auth = { Authorization: `Bearer ${PLATFORM_TOKEN}` };

  it('sin token de plataforma → 401', async () => {
    const res = await request(app).get('/api/platform/clientes/5/modulos');
    expect(res.status).to.equal(401);
  });

  it('GET lista los módulos del tenant', async () => {
    const stub = sinon.stub(pool, 'query').resolves({ rows: [{ id: 1, codigo: 'usuarios', status: true, config: {} }] });
    const res = await request(app).get('/api/platform/clientes/5/modulos').set(auth);

    expect(res.status).to.equal(200);
    expect(res.body[0].codigo).to.equal('usuarios');
    expect(stub.firstCall.args[1]).to.deep.equal([5]);
  });

  it('GET con id inválido → 400', async () => {
    const res = await request(app).get('/api/platform/clientes/abc/modulos').set(auth);
    expect(res.status).to.equal(400);
  });

  it('PATCH sin cambios → 400 EMPTY_PATCH', async () => {
    const res = await request(app).patch('/api/platform/clientes/5/modulos/gasto').set(auth).send({});
    expect(res.status).to.equal(400);
    expect(res.body.code).to.equal('EMPTY_PATCH');
  });

  it('PATCH con status no booleano → 400', async () => {
    const res = await request(app).patch('/api/platform/clientes/5/modulos/gasto').set(auth).send({ status: 'false' });
    expect(res.body.code).to.equal('INVALID_STATUS');
  });

  it('PATCH con config que no es objeto → 400', async () => {
    for (const config of [null, [1, 2], 'x']) {
      const res = await request(app).patch('/api/platform/clientes/5/modulos/gasto').set(auth).send({ config });
      expect(res.status).to.equal(400, JSON.stringify(config));
      expect(res.body.code).to.equal('INVALID_CONFIG');
    }
  });

  it('PATCH de un módulo que el tenant no tiene → 404', async () => {
    sinon.stub(pool, 'query').resolves({ rows: [] });
    const res = await request(app).patch('/api/platform/clientes/5/modulos/productos').set(auth).send({ status: false });
    expect(res.status).to.equal(404);
  });

  it('PATCH desactiva y actualiza config', async () => {
    sinon.stub(console, 'info');
    const stub = sinon.stub(pool, 'query').resolves({
      rows: [{ id: 9, codigo: 'gasto', status: false, config: { dia_vencimiento: 5 } }],
    });
    const res = await request(app).patch('/api/platform/clientes/5/modulos/gasto').set(auth)
      .send({ status: false, config: { dia_vencimiento: 5 } });

    expect(res.status).to.equal(200);
    expect(res.body.status).to.equal(false);
    expect(stub.firstCall.args[1]).to.deep.equal([5, 'gasto', false, '{"dia_vencimiento":5}']);
  });

  it('PATCH sólo status no pisa la config', async () => {
    sinon.stub(console, 'info');
    const stub = sinon.stub(pool, 'query').resolves({ rows: [{ id: 9, codigo: 'gasto', status: true }] });
    await request(app).patch('/api/platform/clientes/5/modulos/gasto').set(auth).send({ status: true });

    expect(stub.firstCall.args[1][3]).to.equal(null);
  });
});
