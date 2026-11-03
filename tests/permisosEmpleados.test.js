/**
 * permisosEmpleados.test.js — plantilla de permisos por rol, guards en las
 * rutas que no tenían, perfiles ajenos y refresco de sesión.
 */
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const sinon = require('sinon');
const jwt = require('jsonwebtoken');

const app = require('../node');
const pool = require('../pool');
const { requierePermiso, soloAdmin, esAdmin } = require('../middleware/acceso');
const operacionesService = require('../services/operaciones_diarias/operacionesDiariasService');
const pedidoDb = require('../model/pedido/db');
const profileDb = require('../model/profile/db');
const productoService = require('../services/producto/productoService');
const userService = require('../services/user/userService');
const ClienteService = require('../services/cliente/clienteService');
const mailer = require('../services/email');

let expect;
before(async () => { ({ expect } = await import('chai')); });
afterEach(() => sinon.restore());

const C = 40;

// Empleado de gastronomía con la plantilla de la 028
const EMPLEADO = {
  userId: 21, cliente_id: C, username: 'cajero', role: ['empleado'], tipo: 'EMP',
  modules: ['operaciones', 'cerrarcaja', 'inventario'],
  permissions: {
    operaciones: ['operaciones.list', 'operaciones.create', 'operaciones.update'],
    cerrarcaja: ['cerrarcaja.list', 'cerrarcaja.create'],
    inventario: ['inventario.list', 'inventario.create'],
  },
  debeCambiarPassword: false,
};
const ADMIN = {
  userId: 7, cliente_id: C, username: 'duenio', role: ['admin'], tipo: 'ADMIN',
  modules: ['operaciones', 'cerrarcaja', 'gasto', 'usuarios', 'productos'],
  permissions: {}, // admin viejo sin permisos .list: alcanza con el módulo
  debeCambiarPassword: false,
};
const auth = (payload) => ({ Authorization: `Bearer ${jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' })}` });

// ─── middleware ───────────────────────────────────────────────────────────
describe('Permisos — requierePermiso / soloAdmin', () => {
  const correr = (mw, user) => {
    const res = { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
    let siguio = false;
    mw({ user }, res, () => { siguio = true; });
    return { res, siguio };
  };

  it('pide módulo Y permiso; con varios códigos alcanza uno', () => {
    expect(correr(requierePermiso('operaciones.create'), EMPLEADO).siguio).to.equal(true);
    expect(correr(requierePermiso('operaciones.delete'), EMPLEADO).siguio).to.equal(false);
    expect(correr(requierePermiso('gasto.list', 'cerrarcaja.list'), EMPLEADO).siguio).to.equal(true);
    // permiso sin el módulo: no pasa
    const sinModulo = { ...EMPLEADO, modules: ['operaciones'] };
    expect(correr(requierePermiso('cerrarcaja.list'), sinModulo).siguio).to.equal(false);
  });

  it('403 con code SIN_PERMISO', () => {
    const { res } = correr(requierePermiso('gasto.create'), EMPLEADO);
    expect(res.code).to.equal(403);
    expect(res.body.code).to.equal('SIN_PERMISO');
  });

  it('permisos _global cuentan si el usuario tiene el módulo', () => {
    const u = { ...EMPLEADO, modules: ['gasto'], permissions: { _global: ['gasto.create'] } };
    expect(correr(requierePermiso('gasto.create'), u).siguio).to.equal(true);
  });

  it('admin: alcanza con el módulo; sin el módulo, no', () => {
    expect(correr(requierePermiso('gasto.delete'), ADMIN).siguio).to.equal(true);
    expect(correr(requierePermiso('inventario.list'), ADMIN).siguio).to.equal(false);
  });

  it('códigos mal escritos rompen al cargar la ruta, no en producción', () => {
    expect(() => requierePermiso('operaciones')).to.throw();
    expect(() => requierePermiso('operaciones.borrar')).to.throw();
    expect(() => requierePermiso()).to.throw();
  });

  it('admin por tipo de usuario (aunque el rol se llame "Dueño"); empleado no', () => {
    expect(esAdmin({ tipo: 'ADMIN', role: ['Dueño'] })).to.equal(true);
    expect(esAdmin({ tipo: 'EMP', role: ['empleado'] })).to.equal(false);
    expect(correr(soloAdmin, EMPLEADO).res.body.code).to.equal('SOLO_ADMIN');
    expect(correr(soloAdmin, ADMIN).siguio).to.equal(true);
  });
});

// ─── HTTP: empleado con la plantilla ──────────────────────────────────────
describe('Permisos — lo que puede y no puede un empleado', () => {
  it('toma pedidos, con su usuario aunque el body diga otro', async () => {
    const crear = sinon.stub(operacionesService, 'crearPedido').resolves(123);
    sinon.stub(pool, 'query').resolves({ rows: [{ count: '0' }] }); // requireLimit
    const res = await request(app).post('/api/operaciones/crear-pedido').set(auth(EMPLEADO))
      .send({ registro_diario_id: 3, usuario_id: 7, cliente_id: C, productos: [] });
    expect(res.status).to.equal(201);
    expect(crear.firstCall.args[0]).to.include({ usuario_id: 21, cliente_id: C });
  });

  it('no borra pedidos (operaciones.delete queda para el dueño)', async () => {
    const res = await request(app).delete(`/api/operaciones/borrar-pedido/5/${C}`).set(auth(EMPLEADO));
    expect(res.status).to.equal(403);
  });

  it('no carga ni borra gastos sin el módulo Gastos', async () => {
    expect((await request(app).post('/api/salida-caja').set(auth(EMPLEADO)).send([])).status).to.equal(403);
    expect((await request(app).delete(`/api/salida-caja/1/${C}`).set(auth(EMPLEADO))).status).to.equal(403);
    expect((await request(app).post('/api/operaciones/registrar-salida-caja').set(auth(EMPLEADO)).send({})).status).to.equal(403);
  });

  it('cierra la caja (cerrarcaja.create)', async () => {
    const cerrar = sinon.stub(operacionesService, 'actualizarRegistroDiarioService').resolves({ ok: true });
    const res = await request(app).put('/api/operaciones/cierre-caja').set(auth(EMPLEADO)).send({ id: 3, cliente_id: C });
    expect(res.status).to.equal(200);
    expect(cerrar.calledOnce).to.equal(true);
  });

  it('ve la lista de productos para tomar pedidos sin tener el módulo Productos', async () => {
    sinon.stub(productoService, 'getProductoListService').resolves([]);
    const res = await request(app).get(`/api/producto/list/${C}`).set(auth(EMPLEADO));
    expect(res.status).to.equal(200);
  });

  it('no puede tocar roles, módulos ni permisos', async () => {
    for (const [metodo, url] of [
      ['post', '/api/rolpermiso'], ['post', '/api/modulorol'], ['post', '/api/permiso'], ['post', '/api/modulo'],
      ['put', '/api/modulorol/1'], ['delete', `/api/rolpermiso/1/${C}`],
    ]) {
      const res = await request(app)[metodo](url).set(auth(EMPLEADO)).send({ id_rol: 1, id_permiso: 1, cliente_id: C });
      expect(res.status, `${metodo} ${url}`).to.equal(403);
      expect(res.body.code, `${metodo} ${url}`).to.equal('SOLO_ADMIN');
    }
  });

  it('catálogos globales: nadie escribe por la API de tenant, ni el admin', async () => {
    for (const [metodo, url] of [
      ['post', '/api/medioPago'], ['put', '/api/medioPago/1'], ['delete', '/api/medioPago/1'],
      ['post', '/api/categoria-tipo'], ['put', '/api/categoria-tipo/1'], ['delete', '/api/categoria-tipo/1'],
    ]) {
      const res = await request(app)[metodo](url).set(auth(ADMIN)).send({ descripcion: 'x' });
      expect(res.status, `${metodo} ${url}`).to.equal(404);
    }
  });

  it('registros de caja a mano y legajos de empleados: sólo admin', async () => {
    expect((await request(app).put('/api/registro_diario/3').set(auth(EMPLEADO)).send({})).status).to.equal(403);
    expect((await request(app).get('/api/empleado/list').set(auth(EMPLEADO))).status).to.equal(403);
  });
});

// ─── perfiles ─────────────────────────────────────────────────────────────
describe('Permisos — perfiles', () => {
  it('un empleado NO puede cambiarle la contraseña al dueño', async () => {
    sinon.stub(profileDb, 'getProfileById').resolves({ id: 1, id_user: 7, cliente_id: C });
    const upd = sinon.stub(profileDb, 'updateProfile');
    const res = await request(app).put('/api/profile/1').set(auth(EMPLEADO)).send({ password: 'Hackeado123' });
    expect(res.status).to.equal(403);
    expect(res.body.code).to.equal('PERFIL_AJENO');
    expect(upd.called).to.equal(false);
  });

  it('cada uno edita su propio perfil', async () => {
    sinon.stub(profileDb, 'getProfileById').resolves({ id: 2, id_user: 21, cliente_id: C });
    sinon.stub(profileDb, 'updateProfile').resolves({ id: 2 });
    const res = await request(app).put('/api/profile/2').set(auth(EMPLEADO)).send({ telefono: '351' });
    expect(res.status).to.equal(200);
  });

  it('el admin edita perfiles ajenos', async () => {
    sinon.stub(profileDb, 'getProfileById').resolves({ id: 2, id_user: 21, cliente_id: C });
    sinon.stub(profileDb, 'updateProfile').resolves({ id: 2 });
    const res = await request(app).put('/api/profile/2').set(auth(ADMIN)).send({ telefono: '351' });
    expect(res.status).to.equal(200);
  });

  it('perfil de otro comercio: 404', async () => {
    sinon.stub(profileDb, 'getProfileById').resolves(undefined);
    const res = await request(app).put('/api/profile/999').set(auth(ADMIN)).send({ telefono: '351' });
    expect(res.status).to.equal(404);
  });

  it('un empleado no da de alta perfiles para otros', async () => {
    const res = await request(app).post('/api/profile').set(auth(EMPLEADO))
      .send({ id_user: 7, telefono: '351', password: 'Algo12345', fecha_ingreso: '2026-01-01' });
    expect(res.status).to.equal(403);
  });
});

// ─── detalle de pedido ────────────────────────────────────────────────────
describe('Permisos — detalle de pedido filtrado por comercio', () => {
  it('pasa el comercio del token y lo usa en el SQL', async () => {
    const q = sinon.stub(pool, 'query').resolves({ rows: [{ id: 1 }] });
    const res = await request(app).get('/api/operaciones/detalle-pedido/55').set(auth(EMPLEADO));
    expect(res.status).to.equal(200);
    const [sql, params] = q.lastCall.args;
    expect(sql).to.match(/pe\.cliente_id = \$2/);
    expect(params).to.deep.equal(['55', C]);
  });
});

// ─── refresco de sesión ───────────────────────────────────────────────────
describe('Permisos — POST /api/cuenta/sesion', () => {
  it('devuelve un token con los permisos actuales de la base', async () => {
    sinon.stub(userService, 'buildSessionById').resolves({
      id: 21, cliente_id: C, cliente_estado: 'ACTIVO', role: ['empleado'], tipo: 'EMP',
      modules: ['operaciones', 'gasto'], permissions: { gasto: ['gasto.create'] },
    });
    const res = await request(app).post('/api/cuenta/sesion').set(auth(EMPLEADO));
    expect(res.status).to.equal(200);
    const nuevo = jwt.verify(res.body.token, process.env.JWT_SECRET);
    expect(nuevo.modules).to.include('gasto');
    expect(nuevo.permissions.gasto).to.deep.equal(['gasto.create']);
    expect(nuevo.userId).to.equal(21);
  });

  it('no alarga la sesión: el token nuevo vence cuando vencía el anterior', async () => {
    sinon.stub(userService, 'buildSessionById').resolves({ id: 21, cliente_id: C, cliente_estado: 'ACTIVO', modules: [], permissions: {} });
    const viejo = jwt.sign(EMPLEADO, process.env.JWT_SECRET, { expiresIn: '1h' });
    const res = await request(app).post('/api/cuenta/sesion').set({ Authorization: `Bearer ${viejo}` });
    expect(jwt.decode(res.body.token).exp).to.equal(jwt.decode(viejo).exp);
  });

  it('usuario dado de baja → 401', async () => {
    sinon.stub(userService, 'buildSessionById').resolves(null);
    const res = await request(app).post('/api/cuenta/sesion').set(auth(EMPLEADO));
    expect(res.status).to.equal(401);
  });

  it('comercio suspendido → el mismo 403 que el login', async () => {
    sinon.stub(userService, 'buildSessionById').resolves({ id: 21, cliente_id: C, cliente_estado: 'SUSPENDIDO' });
    const res = await request(app).post('/api/cuenta/sesion').set(auth(EMPLEADO));
    expect(res.status).to.equal(403);
    expect(res.body.code).to.equal('CUENTA_INHABILITADA');
  });

  it('403 de módulo y de permiso traen code (el front refresca la sesión con eso)', async () => {
    const res = await request(app).get(`/api/operaciones/listar-pedidos/3/${C}`).set(auth({ ...EMPLEADO, modules: [] }));
    expect(res.status).to.equal(403);
    expect(res.body.code).to.equal('SIN_MODULO');
  });
});

// ─── alta y migración ─────────────────────────────────────────────────────
describe('Permisos — plantilla de roles', () => {
  it('el alta aplica la plantilla dentro de la transacción, después de los permisos del admin', async () => {
    sinon.stub(mailer, 'enqueue').resolves({ id: 1 });
    const calls = [];
    let id = 100;
    const client = {
      release: sinon.spy(),
      query: async (sql, params = []) => {
        calls.push(String(sql));
        const s = String(sql);
        if (s.includes('AS cuit_taken')) return { rows: [{ cuit_taken: false, email_taken: false }] };
        if (s.includes('FROM tier')) return { rows: [{ id: 1, code: 'FREE', precio_mensual: 0, duracion_meses: 1 }] };
        if (s.includes('FROM rubro WHERE')) return { rows: [{ codigo: 'gastronomia', nombre: 'Gastronomía' }] };
        if (s.includes('INSERT INTO cliente')) return { rows: [{ id: 77, rubro_codigo: 'gastronomia' }] };
        if (s.includes('FROM user_type')) return { rows: [{ id: 1, codigo: 'ADMIN', descripcion: 'admin' }, { id: 2, codigo: 'EMP', descripcion: 'empleado' }] };
        if (s.includes('INSERT INTO "user"')) return { rows: [{ id: 10 }] };
        if (s.includes('INSERT INTO rol ')) return { rows: [{ id: id++, descripcion: params[0] }] };
        if (s.includes('INSERT INTO legajo_secuencia')) return { rows: [{ ultimo: 1 }] };
        if (s.includes('FROM modulo_maestro')) return { rows: [{ codigo: 'operaciones', descripcion: 'Pedidos', status: true, config_default: {} }] };
        if (s.includes('INSERT INTO modulo ')) return { rows: [{ id: id++, codigo: params[0], descripcion: params[1] }] };
        if (s.includes('FROM permiso_accion')) return { rows: [{ id: 1, codigo: 'list', descripcion: 'ver' }] };
        if (s.includes('INSERT INTO permiso ')) return { rows: params[0].map((_, i) => ({ id: 500 + i })) };
        return { rows: [] };
      },
    };
    sinon.stub(pool, 'connect').resolves(client);
    await ClienteService.createClienteService({
      nombre: 'Pizzería', cuit: '30712345671', adminNombre: 'Ana', adminApellido: 'Paz',
      adminEmail: 'ana@ejemplo.com', adminPassword: 'Contrasena123', plan: 'FREE',
    });
    const iPlantilla = calls.findIndex((s) => s.includes('aplicar_plantilla_roles'));
    const iPermAdmin = calls.findIndex((s) => s.includes('INSERT INTO rol_permiso'));
    const iCommit = calls.findIndex((s) => /^COMMIT/.test(s.trim()));
    expect(iPlantilla).to.be.greaterThan(iPermAdmin);
    expect(iPlantilla).to.be.lessThan(iCommit);
  });

  const sql = fs.readFileSync(path.join(__dirname, '../migrations/028_plantilla_roles.sql'), 'utf8');

  it('la plantilla es sólo de empleados: nada para admin, proveedor ni cliente', () => {
    const valores = sql.match(/\(VALUES([\s\S]*?)\) AS v\(/)[1];
    const tipos = [...valores.matchAll(/\('\w+', '(\w+)'/g)].map((m) => m[1]);
    expect(new Set(tipos)).to.deep.equal(new Set(['EMP']));
  });

  it('el empleado de gastronomía no borra pedidos ni ve gastos, reportes, usuarios o roles', () => {
    const valores = sql.match(/\(VALUES([\s\S]*?)\) AS v\(/)[1];
    const gastro = [...valores.matchAll(/\('gastronomia', 'EMP', '(\w+)', +'(\w+)'\)/g)].map((m) => `${m[1]}.${m[2]}`);
    expect(gastro).to.include.members(['operaciones.create', 'cerrarcaja.create', 'inventario.create']);
    expect(gastro).to.not.include('operaciones.delete');
    for (const m of ['gasto', 'flujo', 'reportes', 'usuarios', 'roles', 'plan', 'productos']) {
      expect(gastro.some((g) => g.startsWith(`${m}.`)), m).to.equal(false);
    }
  });

  it('sólo toca roles sin ningún permiso (no pisa lo que configuró el dueño)', () => {
    const fn = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION'), sql.indexOf('$$;'));
    expect(fn).to.match(/NOT EXISTS \(SELECT 1 FROM rol_permiso rp\s+WHERE rp\.rol_id = r\.id AND rp\.cliente_id = r\.cliente_id\)/);
    expect(fn).to.not.match(/\bDELETE\s+FROM\b/i);
  });
});
