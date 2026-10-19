// tests/eduCatalogo.test.js
// Etapa 4 (feat/edu-catalogo): reglas puras, validaciones de servicio y
// acceso a /api/edu. La integración completa se verifica contra Postgres
// aparte (script e2e de la etapa).
const request = require('supertest');
const sinon = require('sinon');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-tests';
const app = require('../node');
const reglas = require('../services/edu/reglas');
const catalogoDb = require('../model/edu/catalogo');
const personasDb = require('../model/edu/personas');
const inscDb = require('../model/edu/inscripciones');
const personasService = require('../services/edu/personasService');
const catalogoService = require('../services/edu/catalogoService');
const inscripcionService = require('../services/edu/inscripcionService');
const cuotasService = require('../services/edu/cuotasService');

let expect;
before(async () => { ({ expect } = await import('chai')); });
afterEach(() => sinon.restore());

const PERMISOS = ['alumnos.list', 'alumnos.create', 'alumnos.update', 'alumnos.delete'];
const token = (over = {}) => jwt.sign({
  userId: 7, cliente_id: 40, username: 'x', role: ['admin'], modules: ['alumnos'],
  permissions: { alumnos: PERMISOS }, tipo: 'ADMIN', debeCambiarPassword: false, ...over,
}, process.env.JWT_SECRET, { expiresIn: '1h' });
const auth = (over) => ({ Authorization: `Bearer ${token(over)}` });

describe('edu/reglas', () => {
  it('edad y minoría: cumple años el día exacto', () => {
    expect(reglas.edad('2008-10-13', '2026-10-12')).to.equal(17);
    expect(reglas.edad('2008-10-13', '2026-10-13')).to.equal(18);
    expect(reglas.esMenor('2008-10-13', '2026-10-12')).to.equal(true);
    expect(reglas.esMenor('2008-10-13', '2026-10-13')).to.equal(false);
  });

  it('esFecha rechaza fechas imposibles', () => {
    expect(reglas.esFecha('2026-02-28')).to.equal(true);
    expect(reglas.esFecha('2026-02-30')).to.equal(false);
    expect(reglas.esFecha('13/10/2026')).to.equal(false);
  });

  it('normalizarPeriodo lleva al primer día del mes', () => {
    expect(reglas.normalizarPeriodo('2026-10')).to.equal('2026-10-01');
    expect(reglas.normalizarPeriodo('2026-12-15')).to.equal('2026-12-01');
    expect(reglas.normalizarPeriodo('2026-13')).to.equal(null);
    expect(reglas.normalizarPeriodo('octubre')).to.equal(null);
  });

  describe('precio vigente', () => {
    const precios = [
      { id: 1, vigente_desde: '2026-10-01', importe_mensual: '30000.00' },
      { id: 2, vigente_desde: '2026-12-01', importe_mensual: '36000.00' },
    ];
    it('mes exacto', () => expect(reglas.resolverPrecioVigente(precios, '2026-12').id).to.equal(2));
    it('mes sin precio hereda el anterior', () => {
      expect(reglas.resolverPrecioVigente(precios, '2026-11').id).to.equal(1);
      expect(reglas.resolverPrecioVigente(precios, '2027-05').id).to.equal(2);
    });
    it('antes del primer precio no hay', () => expect(reglas.resolverPrecioVigente(precios, '2026-09')).to.equal(null));
    it('acepta el orden que venga', () => expect(reglas.resolverPrecioVigente([...precios].reverse(), '2026-11').id).to.equal(1));
  });

  describe('horarios', () => {
    it('valida día, formato y rango', () => {
      expect(() => reglas.validarHorarios([])).to.throw(/al menos un horario/);
      expect(() => reglas.validarHorarios([{ dia_semana: 0, hora_inicio: '10:00', hora_fin: '11:00' }])).to.throw(/día/);
      expect(() => reglas.validarHorarios([{ dia_semana: 1, hora_inicio: '10', hora_fin: '11:00' }])).to.throw(/HH:MM/);
      expect(() => reglas.validarHorarios([{ dia_semana: 1, hora_inicio: '11:00', hora_fin: '10:00' }])).to.throw(/posterior/);
      expect(reglas.validarHorarios([{ dia_semana: '2', hora_inicio: '18:00:00', hora_fin: '19:00' }]))
        .to.deep.equal([{ dia_semana: 2, hora_inicio: '18:00', hora_fin: '19:00' }]);
    });

    it('rechaza horarios de la misma inscripción que se pisan', () => {
      expect(() => reglas.validarHorarios([
        { dia_semana: 1, hora_inicio: '10:00', hora_fin: '11:00' },
        { dia_semana: 1, hora_inicio: '10:59', hora_fin: '12:00' },
      ])).to.throw(/se pisan/);
    });

    it('turnos contiguos no se superponen', () => {
      expect(reglas.seSuperponen(
        { dia_semana: 1, hora_inicio: '18:00', hora_fin: '19:00' },
        { dia_semana: 1, hora_inicio: '19:00', hora_fin: '20:00' },
      )).to.equal(false);
    });
  });

  describe('buscarConflictos', () => {
    const turno = { dia_semana: 3, hora_inicio: '17:00', hora_fin: '18:00' };
    const ocupado = (over = {}) => ({ inscripcion_id: 1, clase_id: 9, es_grupal: false, ...turno, alumno: 'Ana', clase: 'Guitarra', ...over });

    it('profesor ocupado en una individual', () => {
      const c = reglas.buscarConflictos([turno], { clase_id: 9, es_grupal: false }, [ocupado()]);
      expect(c[0].motivo).to.equal('PROFESOR_OCUPADO');
    });

    it('taller: mismo turno de la misma clase se comparte', () => {
      const c = reglas.buscarConflictos([turno], { clase_id: 9, es_grupal: true, cupo: 3 }, [ocupado({ es_grupal: true })]);
      expect(c).to.deep.equal([]);
    });

    it('taller: con el cupo lleno → CUPO_COMPLETO', () => {
      const ocup = [ocupado({ es_grupal: true }), ocupado({ es_grupal: true, inscripcion_id: 2 })];
      const c = reglas.buscarConflictos([turno], { clase_id: 9, es_grupal: true, cupo: 2 }, ocup);
      expect(c.map((x) => x.motivo)).to.deep.equal(['CUPO_COMPLETO']);
    });

    it('taller: turno corrido o de otra clase sí choca', () => {
      const corrido = reglas.buscarConflictos(
        [{ dia_semana: 3, hora_inicio: '17:30', hora_fin: '18:30' }], { clase_id: 9, es_grupal: true }, [ocupado({ es_grupal: true })]
      );
      expect(corrido[0].motivo).to.equal('PROFESOR_OCUPADO');
      const otraClase = reglas.buscarConflictos([turno], { clase_id: 9, es_grupal: true }, [ocupado({ es_grupal: true, clase_id: 8 })]);
      expect(otraClase[0].motivo).to.equal('PROFESOR_OCUPADO');
    });

    it('alumno ocupado en otra clase', () => {
      const c = reglas.buscarConflictos([turno], { clase_id: 9, es_grupal: false }, [], [ocupado({ clase_id: 4 })]);
      expect(c[0].motivo).to.equal('ALUMNO_OCUPADO');
    });
  });
});

describe('edu/servicios', () => {
  it('alumno menor sin tutor → MENOR_SIN_TUTOR', async () => {
    const hoy = reglas.hoy();
    const nacimiento = `${Number(hoy.slice(0, 4)) - 10}${hoy.slice(4)}`;
    try {
      await personasService.datosPersona('alumno', 40, { nombre: 'Tomás', apellido: 'Ruiz', fecha_nacimiento: nacimiento });
      expect.fail('debía rechazar');
    } catch (e) {
      expect(e.code).to.equal('MENOR_SIN_TUTOR');
    }
  });

  it('alumno menor con tutor de otro tenant → tutor no encontrado', async () => {
    sinon.stub(personasDb, 'get').resolves(null);
    try {
      await personasService.datosPersona('alumno', 40, { nombre: 'Tomás', apellido: 'Ruiz', fecha_nacimiento: '2015-01-01', tutor_id: 99 });
      expect.fail('debía rechazar');
    } catch (e) {
      expect(e.field).to.equal('tutor_id');
    }
  });

  it('acceso propio para un alumno menor → ALUMNO_MENOR', async () => {
    sinon.stub(personasDb, 'get').resolves({ id: 3, activo: true, user_id: null, tutor_id: 5, fecha_nacimiento: '2015-01-01', email: 'x@y.com' });
    try {
      await personasService.crearAcceso('alumno', 40, 3);
      expect.fail('debía rechazar');
    } catch (e) {
      expect(e.code).to.equal('ALUMNO_MENOR');
    }
  });

  it('precio vigente sin precio previo → 404 SIN_PRECIO', async () => {
    sinon.stub(catalogoDb, 'getClase').resolves({ id: 1 });
    sinon.stub(catalogoDb, 'listarPrecios').resolves([{ id: 1, vigente_desde: '2026-10-01', importe_mensual: '1' }]);
    try {
      await catalogoService.precioVigente(40, 1, '2026-09');
      expect.fail('debía rechazar');
    } catch (e) {
      expect(e.status).to.equal(404);
      expect(e.code).to.equal('SIN_PRECIO');
    }
  });

  it('inscripción superpuesta con el profesor → 409 HORARIO_SUPERPUESTO, sin insertar', async () => {
    sinon.stub(personasDb, 'get').resolves({ id: 1, activo: true });
    sinon.stub(catalogoDb, 'getClase').resolves({ id: 9, activa: true, es_grupal: false, cupo: null });
    sinon.stub(inscDb, 'existeDuplicada').resolves(null);
    const ocupados = sinon.stub(inscDb, 'ocupados');
    ocupados.onFirstCall().resolves([{ inscripcion_id: 2, clase_id: 9, es_grupal: false, dia_semana: 1, hora_inicio: '18:00', hora_fin: '19:00', alumno: 'Ana', clase: 'Guitarra' }]);
    ocupados.onSecondCall().resolves([]);
    const crear = sinon.stub(inscDb, 'crear');
    try {
      await inscripcionService.crear(40, {
        alumno_id: 3, clase_id: 9, profesor_id: 1, ciclo: 2026, horarios: [{ dia_semana: 1, hora_inicio: '18:30', hora_fin: '19:30' }],
      });
      expect.fail('debía rechazar');
    } catch (e) {
      expect(e.status).to.equal(409);
      expect(e.code).to.equal('HORARIO_SUPERPUESTO');
      expect(e.message).to.equal('El profesor ya tiene clase el lunes de 18:00 a 19:00 (Ana, Guitarra)');
      expect(crear.called).to.equal(false);
    }
  });

  it('ciclo lejano al alta → 400 en ciclo (2099 con alta 2026); el siguiente se acepta', async () => {
    const crear = sinon.stub(inscDb, 'crear');
    const base = { alumno_id: 3, clase_id: 9, profesor_id: 1, fecha_alta: '2026-10-13', horarios: [{ dia_semana: 1, hora_inicio: '18:00', hora_fin: '19:00' }] };
    for (const ciclo of [2099, 2025]) {
      try {
        await inscripcionService.crear(40, { ...base, ciclo });
        expect.fail('debía rechazar');
      } catch (e) {
        expect(e.status).to.equal(400);
        expect(e.field).to.equal('ciclo');
        expect(e.message).to.equal('El ciclo tiene que ser 2026 o 2027 (según la fecha de alta)');
      }
    }
    expect(crear.called).to.equal(false);
    sinon.stub(personasDb, 'get').resolves({ id: 1, activo: true });
    sinon.stub(catalogoDb, 'getClase').resolves({ id: 9, activa: true, es_grupal: false, cupo: null });
    sinon.stub(inscDb, 'existeDuplicada').resolves(null);
    sinon.stub(inscDb, 'ocupados').resolves([]);
    crear.resolves({ id: 77 });
    sinon.stub(inscDb, 'reemplazarHorarios').resolves();
    sinon.stub(inscDb, 'get').resolves({ id: 77, ciclo: 2027 });
    sinon.stub(cuotasService, 'generarParaAlta').resolves([]);
    await inscripcionService.crear(40, { ...base, ciclo: 2027 });
    expect(crear.firstCall.args[1].ciclo).to.equal(2027);
  });

  it('baja anterior al alta → 400', async () => {
    sinon.stub(inscDb, 'get').resolves({ id: 5, profesor_id: 1, fecha_alta: '2026-10-05', fecha_baja: null, horarios: [] });
    try {
      await inscripcionService.actualizar(40, 5, { fecha_baja: '2026-10-01' });
      expect.fail('debía rechazar');
    } catch (e) {
      expect(e.field).to.equal('fecha_baja');
    }
  });
});

describe('/api/edu: acceso', () => {
  beforeEach(() => sinon.stub(catalogoDb, 'tenantTieneModulo').resolves(true));

  it('comercio sin el módulo → 403 MODULO_INACTIVO', async () => {
    catalogoDb.tenantTieneModulo.resolves(false);
    const r = await request(app).get('/api/edu/clases').set(auth());
    expect(r.status).to.equal(403);
    expect(r.body.code).to.equal('MODULO_INACTIVO');
  });

  it('admin con el módulo y permiso lista clases', async () => {
    sinon.stub(catalogoDb, 'listarClases').resolves([{ id: 1, nombre: 'Guitarra' }]);
    const r = await request(app).get('/api/edu/clases').set(auth());
    expect(r.status).to.equal(200);
    expect(r.body[0].nombre).to.equal('Guitarra');
  });

  it('staff sin permiso de alta → 403', async () => {
    const r = await request(app).post('/api/edu/clases').set(auth({ permissions: { alumnos: ['alumnos.list'] } })).send({});
    expect(r.status).to.equal(403);
  });

  it('profesor no entra a la administración aunque tenga el permiso en el token', async () => {
    const r = await request(app).get('/api/edu/alumnos').set(auth({ tipo: 'PROF', role: ['profesor'] }));
    expect(r.status).to.equal(403);
    expect(r.body.code).to.equal('ROL_SIN_ACCESO');
  });

  it('/mis: el alcance del profesor filtra; inscripción ajena → 404', async () => {
    sinon.stub(personasDb, 'porUserId').resolves({ id: 12, activo: true });
    const get = sinon.stub(inscDb, 'get').resolves(null);
    const r = await request(app).get('/api/edu/mis/inscripciones/99').set(auth({ tipo: 'PROF', role: ['profesor'], modules: [], permissions: {} }));
    expect(r.status).to.equal(404);
    expect(get.firstCall.args).to.deep.equal([40, 99, { profesor_id: 12 }]);
  });

  it('/mis sin ficha vinculada → 403 SIN_FICHA', async () => {
    sinon.stub(personasDb, 'porUserId').resolves(null);
    const r = await request(app).get('/api/edu/mis/inscripciones').set(auth({ tipo: 'ALU', role: ['alumno'] }));
    expect(r.status).to.equal(403);
    expect(r.body.code).to.equal('SIN_FICHA');
  });

  it('/mis es sólo para profesor, tutor y alumno', async () => {
    const r = await request(app).get('/api/edu/mis/perfil').set(auth());
    expect(r.status).to.equal(403);
  });

  it('precioId inválido → 400', async () => {
    const r = await request(app).put('/api/edu/clases/1/precios/abc').set(auth()).send({ importe_mensual: 10 });
    expect(r.status).to.equal(400);
  });
});

describe('/api/edu/mis/agenda: alcance propio', () => {
  beforeEach(() => sinon.stub(catalogoDb, 'tenantTieneModulo').resolves(true));

  for (const [tipo, campo] of [['TUT', 'tutor_id'], ['ALU', 'alumno_id'], ['PROF', 'profesor_id']]) {
    it(`${tipo}: la agenda se filtra por ${campo} e ignora ?profesor_id`, async () => {
      sinon.stub(personasDb, 'porUserId').resolves({ id: 21, activo: true });
      const ag = sinon.stub(inscDb, 'agenda').resolves([]);
      const r = await request(app).get('/api/edu/mis/agenda?profesor_id=999').set(auth({ tipo, role: ['x'], modules: [], permissions: {} }));
      expect(r.status).to.equal(200);
      const filtros = ag.firstCall.args[1];
      expect(filtros[campo]).to.equal(21);
      for (const otro of ['profesor_id', 'tutor_id', 'alumno_id'].filter((c) => c !== campo)) {
        expect(filtros[otro] ?? null).to.equal(null);
      }
    });
  }

  it('admin: /agenda sin alcance usa el filtro del query', async () => {
    const ag = sinon.stub(inscDb, 'agenda').resolves([]);
    const r = await request(app).get('/api/edu/agenda?profesor_id=5').set(auth());
    expect(r.status).to.equal(200);
    expect(ag.firstCall.args[1].profesor_id).to.equal(5);
  });
});
