// tests/rolesEdu.test.js
// Etapa 3 (feat/roles-edu): usuarios externos, credenciales temporales y
// cambio obligatorio de contraseña.
const request = require('supertest');
const sinon = require('sinon');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-tests';
const app = require('../node');
const cuentaDb = require('../model/cuenta/db');
const legajoDb = require('../model/profile/legajo');
const cuentaService = require('../services/cuenta/cuentaService');
const userService = require('../services/user/userService');
const userDb = require('../model/users/db');
const salidaCajaDb = require('../model/salida_caja/db');
const { buildTokenPayload } = require('../services/auth/tokenService');
const { errorPassword, generarPasswordTemporal } = require('../validators/passwordPolicy');

let expect;
before(async () => { ({ expect } = await import('chai')); });
afterEach(() => sinon.restore());

const token = (over = {}) => jwt.sign({
  userId: 7, cliente_id: 40, username: 'x', role: ['admin'], modules: ['usuarios', 'gasto', 'flujo'],
  permissions: {}, tipo: 'ADMIN', debeCambiarPassword: false, ...over,
}, process.env.JWT_SECRET, { expiresIn: '1h' });
const auth = (over) => ({ Authorization: `Bearer ${token(over)}` });

describe('passwordPolicy', () => {
  it('aplica la misma política que el alta', () => {
    expect(errorPassword('corta')).to.match(/10/);
    expect(errorPassword('sinmayusculas123')).to.match(/mayúscula/);
    expect(errorPassword('SINMINUSCULAS123')).to.match(/minúscula/);
    expect(errorPassword('SinNumerosAca')).to.match(/número/);
    expect(errorPassword('Contrasena123')).to.equal(null);
  });

  it('la contraseña temporal cumple la política y no tiene caracteres ambiguos', () => {
    for (let i = 0; i < 200; i++) {
      const p = generarPasswordTemporal();
      expect(p).to.have.length(12);
      expect(errorPassword(p), p).to.equal(null);
      expect(p).to.not.match(/[0O1lI]/);
    }
  });
});

describe('Sesión: tipo de usuario y contraseña temporal en el JWT', () => {
  it('buildTokenPayload incluye tipo y debeCambiarPassword', () => {
    const p = buildTokenPayload({ id: 1, cliente_id: 2, tipo: 'TUT', debeCambiarPassword: true });
    expect(p.tipo).to.equal('TUT');
    expect(p.debeCambiarPassword).to.equal(true);
  });

  it('tokens viejos sin esos campos quedan como staff con contraseña definitiva', () => {
    const p = buildTokenPayload({ id: 1, cliente_id: 2 });
    expect(p.tipo).to.equal(null);
    expect(p.debeCambiarPassword).to.equal(false);
  });

  it('login devuelve debeCambiarPassword para que el front lleve al cambio', async () => {
    sinon.stub(userService, 'authenticate').resolves({
      id: 9, cliente_id: 40, role: ['tutor'], modules: [], permissions: {},
      cliente_estado: 'ACTIVO', tipo: 'TUT', debeCambiarPassword: true,
    });
    const res = await request(app).post('/api/auth/login').send({ email: 'tutor@ejemplo.com', password: 'Temporal123x' });
    expect(res.status).to.equal(200);
    expect(res.body.debeCambiarPassword).to.equal(true);
    expect(jwt.decode(res.body.token).tipo).to.equal('TUT');
  });
});

describe('Guard de contraseña temporal', () => {
  it('con contraseña temporal sólo deja usar /api/cuenta', async () => {
    const h = auth({ debeCambiarPassword: true });
    const bloqueada = await request(app).get('/api/salida-caja/config').set(h);
    expect(bloqueada.status).to.equal(403);
    expect(bloqueada.body.code).to.equal('PASSWORD_TEMPORAL');

    sinon.stub(cuentaService, 'cambiarPasswordService').rejects(
      new cuentaService.CuentaError('x', { status: 400, code: 'PASSWORD_INCORRECTA' })
    );
    const cuenta = await request(app).post('/api/cuenta/password').set(h).send({ actual: 'a', nueva: 'b' });
    expect(cuenta.body.code).to.not.equal('PASSWORD_TEMPORAL');
  });

  it('también bloquea billing, montado fuera de la cadena general', async () => {
    const res = await request(app).get('/api/billing/estado').set(auth({ debeCambiarPassword: true }));
    expect(res.status).to.equal(403);
    expect(res.body.code).to.equal('PASSWORD_TEMPORAL');
  });

  it('sin contraseña temporal no interfiere', async () => {
    sinon.stub(salidaCajaDb, 'tenantUsaCaja').resolves(true);
    const res = await request(app).get('/api/salida-caja/config').set(auth());
    expect(res.status).to.equal(200);
  });
});

describe('Usuarios externos (profesor, tutor, alumno): deny-by-default', () => {
  for (const tipo of ['PROF', 'TUT', 'ALU']) {
    it(`${tipo} no puede asignarse roles, ver usuarios, gastos ni configuración`, async () => {
      const h = auth({ tipo, role: ['admin'], modules: ['usuarios', 'gasto'] }); // aunque el rol diga admin
      for (const [m, path] of [
        ['post', '/api/userrol'],
        ['get', '/api/users/list/40'],
        ['put', '/api/profile/1'],
        ['get', '/api/salida-caja/config'],
        ['get', '/api/categoria-salida/list/40'],
        ['post', '/api/rol'],
        ['get', '/api/billing/estado'],
        ['post', '/api/cuenta/credenciales'],
      ]) {
        const res = await request(app)[m](path).set(h).send({});
        expect(res.status, `${tipo} ${m} ${path}`).to.equal(403);
        expect(res.body.code, `${tipo} ${m} ${path}`).to.equal('ROL_SIN_ACCESO');
      }
    });
  }

  it('el externo puede cambiar su contraseña y leer el plan', async () => {
    const h = auth({ tipo: 'ALU', role: ['alumno'], modules: [] });
    sinon.stub(cuentaService, 'cambiarPasswordService').resolves();
    sinon.stub(userService, 'buildSessionById').resolves({ id: 7, cliente_id: 40, tipo: 'ALU' });
    const pwd = await request(app).post('/api/cuenta/password').set(h).send({ actual: 'Temporal123x', nueva: 'NuevaClave123' });
    expect(pwd.status).to.equal(200);

    const plan = await request(app).get('/api/cliente-plan/mi-plan').set(h);
    expect(plan.body.code).to.not.equal('ROL_SIN_ACCESO');
  });

  it('el staff (admin, empleado) no se ve afectado', async () => {
    sinon.stub(salidaCajaDb, 'tenantUsaCaja').resolves(false);
    for (const tipo of ['ADMIN', 'EMP', null]) {
      const res = await request(app).get('/api/salida-caja/config').set(auth({ tipo }));
      expect(res.status, String(tipo)).to.equal(200);
    }
  });
});

describe('Tipos de usuario por rubro', () => {
  it('GET /api/users/tipo filtra por el tenant del JWT', async () => {
    const stub = sinon.stub(userDb, 'getUserTypeList').resolves({ rows: [{ id: 1, codigo: 'ADMIN' }] });
    const res = await request(app).get('/api/users/tipo').set(auth());
    expect(res.status).to.equal(200);
    expect(stub.firstCall.args[0]).to.equal(40);
  });

  it('GET /api/cuenta/tipos (admin) lista los tipos para credenciales', async () => {
    sinon.stub(cuentaDb, 'getTiposCredenciales').resolves([{ codigo: 'PROF' }, { codigo: 'TUT' }, { codigo: 'ALU' }]);
    const res = await request(app).get('/api/cuenta/tipos').set(auth());
    expect(res.status).to.equal(200);
    expect(res.body.map((t) => t.codigo)).to.deep.equal(['PROF', 'TUT', 'ALU']);
  });
});

describe('POST /api/cuenta/credenciales', () => {
  const body = { nombre: 'Laura', apellido: 'Gómez', email: ' Laura@Ejemplo.com ', tipo: 'tut', telefono: '351-555-1234' };

  const stubAlta = () => {
    sinon.stub(cuentaDb, 'getUserTypeDelRubro').resolves({ id: 6, codigo: 'TUT', descripcion: 'tutor' });
    sinon.stub(cuentaDb, 'emailExiste').resolves(false);
    const crearUser = sinon.stub(cuentaDb, 'crearUser').callsFake(async (u) => ({ id: 55, ...u }));
    sinon.stub(legajoDb, 'siguienteLegajo').resolves('8');
    const crearProfile = sinon.stub(cuentaDb, 'crearProfile').resolves();
    sinon.stub(cuentaDb, 'getOrCreateRol').resolves(201);
    const asignarRol = sinon.stub(cuentaDb, 'asignarRol').resolves();
    return { crearUser, crearProfile, asignarRol };
  };

  it('crea usuario, profile con contraseña temporal y rol; devuelve la contraseña una vez', async () => {
    const s = stubAlta();
    const res = await request(app).post('/api/cuenta/credenciales').set(auth()).send(body);

    expect(res.status).to.equal(201);
    expect(res.body.user).to.deep.equal({ id: 55, nombre: 'Laura', apellido: 'Gómez', email: 'laura@ejemplo.com', tipo: 'TUT' });
    expect(errorPassword(res.body.passwordTemporal)).to.equal(null);
    expect(s.crearUser.firstCall.args[0]).to.include({ email: 'laura@ejemplo.com', user_type_id: 6, cliente_id: 40 });
    const prof = s.crearProfile.firstCall.args[0];
    expect(prof.telefono).to.equal('3515551234');
    expect(prof.legajo).to.equal('8');
    expect(prof.passwordHash).to.not.equal(res.body.passwordTemporal); // nunca en claro
    expect(s.asignarRol.firstCall.args).to.deep.equal([55, 201, 40]);
  });

  it('empleado (no admin) → 403', async () => {
    const res = await request(app).post('/api/cuenta/credenciales')
      .set(auth({ role: ['empleado'], tipo: 'EMP' })).send(body);
    expect(res.status).to.equal(403);
  });

  it('tipo que no es del rubro del tenant → 400 TIPO_INVALIDO', async () => {
    sinon.stub(cuentaDb, 'getUserTypeDelRubro').resolves(null);
    const res = await request(app).post('/api/cuenta/credenciales').set(auth()).send({ ...body, tipo: 'PROF' });
    expect(res.status).to.equal(400);
    expect(res.body.code).to.equal('TIPO_INVALIDO');
  });

  it('no permite crear administradores', async () => {
    const res = await request(app).post('/api/cuenta/credenciales').set(auth()).send({ ...body, tipo: 'ADMIN' });
    expect(res.body.code).to.equal('TIPO_INVALIDO');
  });

  it('email repetido → 409 EMAIL_TAKEN', async () => {
    sinon.stub(cuentaDb, 'getUserTypeDelRubro').resolves({ id: 6, codigo: 'TUT', descripcion: 'tutor' });
    sinon.stub(cuentaDb, 'emailExiste').resolves(true);
    const res = await request(app).post('/api/cuenta/credenciales').set(auth()).send(body);
    expect(res.status).to.equal(409);
    expect(res.body.code).to.equal('EMAIL_TAKEN');
  });

  it('valida nombre, apellido y email', async () => {
    for (const [campo, valor] of [['nombre', 'L'], ['apellido', ''], ['email', 'no-es-email']]) {
      const res = await request(app).post('/api/cuenta/credenciales').set(auth()).send({ ...body, [campo]: valor });
      expect(res.status, campo).to.equal(400);
      expect(res.body.field, campo).to.equal(campo);
    }
  });
});

describe('POST /api/cuenta/credenciales/:userId/reset', () => {
  it('genera otra contraseña temporal y vuelve a marcar el cambio obligatorio', async () => {
    sinon.stub(cuentaDb, 'getUsuarioConPassword').resolves({ id: 55, email: 'l@e.com', tipo: 'TUT', password: 'h' });
    const set = sinon.stub(cuentaDb, 'setPassword').resolves(true);
    const res = await request(app).post('/api/cuenta/credenciales/55/reset').set(auth());

    expect(res.status).to.equal(200);
    expect(errorPassword(res.body.passwordTemporal)).to.equal(null);
    expect(set.firstCall.args[0]).to.equal(55);
    expect(set.firstCall.args[3]).to.equal(true);
  });

  it('no resetea administradores ni la propia cuenta', async () => {
    sinon.stub(cuentaDb, 'getUsuarioConPassword').resolves({ id: 8, tipo: 'ADMIN', password: 'h' });
    const admin = await request(app).post('/api/cuenta/credenciales/8/reset').set(auth());
    expect(admin.body.code).to.equal('TIPO_INVALIDO');
    const propia = await request(app).post('/api/cuenta/credenciales/7/reset').set(auth());
    expect(propia.body.code).to.equal('SELF_RESET');
  });

  it('usuario de otro tenant o inexistente → 404', async () => {
    sinon.stub(cuentaDb, 'getUsuarioConPassword').resolves(null);
    const res = await request(app).post('/api/cuenta/credenciales/999/reset').set(auth());
    expect(res.status).to.equal(404);
  });
});

describe('POST /api/cuenta/password', () => {
  const bcrypt = require('bcrypt'); // en tests es el shim de tests/setup.js

  it('cambia la contraseña, saca el flag y devuelve un token nuevo', async () => {
    sinon.stub(cuentaDb, 'getUsuarioConPassword').resolves({ id: 7, password: 'hash' });
    sinon.stub(bcrypt, 'compare').resolves(true);
    const set = sinon.stub(cuentaDb, 'setPassword').resolves(true);
    sinon.stub(userService, 'buildSessionById').resolves({ id: 7, cliente_id: 40, tipo: 'TUT', debeCambiarPassword: false });

    const res = await request(app).post('/api/cuenta/password')
      .set(auth({ tipo: 'TUT', debeCambiarPassword: true }))
      .send({ actual: 'Temporal123x', nueva: 'NuevaClave123' });

    expect(res.status).to.equal(200);
    expect(set.firstCall.args[3]).to.equal(false);
    expect(jwt.decode(res.body.token).debeCambiarPassword).to.equal(false);
  });

  it('contraseña actual incorrecta → 400 PASSWORD_INCORRECTA (no 401: el front haría logout)', async () => {
    sinon.stub(cuentaDb, 'getUsuarioConPassword').resolves({ id: 7, password: 'hash' });
    sinon.stub(bcrypt, 'compare').resolves(false);
    const res = await request(app).post('/api/cuenta/password').set(auth())
      .send({ actual: 'otra', nueva: 'NuevaClave123' });
    expect(res.status).to.equal(400);
    expect(res.body.code).to.equal('PASSWORD_INCORRECTA');
  });

  it('nueva débil o igual a la actual → 400', async () => {
    const debil = await request(app).post('/api/cuenta/password').set(auth()).send({ actual: 'Temporal123x', nueva: 'corta' });
    expect(debil.body.code).to.equal('PASSWORD_DEBIL');
    const igual = await request(app).post('/api/cuenta/password').set(auth()).send({ actual: 'NuevaClave123', nueva: 'NuevaClave123' });
    expect(igual.body.code).to.equal('PASSWORD_REPETIDA');
  });
});
