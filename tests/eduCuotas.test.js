// tests/eduCuotas.test.js
// Etapa 6 (feat/edu-cuotas): reglas puras de cuotas, generación, pagos,
// storage genérico, rutas y cron. Sin base ni red (stubs); la integración
// contra Postgres va en el script e2e de la etapa.
const request = require('supertest');
const sinon = require('sinon');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-tests';
process.env.CRON_SECRET = process.env.CRON_SECRET || 'test-cron-secret-for-tests-only';
const app = require('../node');
const pool = require('../pool');
const R = require('../services/edu/cuotasReglas');
const db = require('../model/edu/cuotas');
const catalogoDb = require('../model/edu/catalogo');
const personasDb = require('../model/edu/personas');
const cuotasService = require('../services/edu/cuotasService');
const pagosService = require('../services/edu/pagosService');
const cuotasCron = require('../services/edu/cuotasCron');
const storage = require('../services/storage');
const cloudinaryProvider = require('../services/storage/providers/cloudinary');

let expect;
before(async () => { ({ expect } = await import('chai')); });
afterEach(() => { sinon.restore(); delete process.env.STORAGE_PROVIDER; });

const CFG = R.normalizarConfig(null);
const PERMISOS = ['alumnos.list', 'alumnos.create', 'alumnos.update', 'alumnos.delete'];
const token = (over = {}) => jwt.sign({
  userId: 7, cliente_id: 40, username: 'x', role: ['admin'], modules: ['alumnos'],
  permissions: { alumnos: PERMISOS }, tipo: 'ADMIN', debeCambiarPassword: false, ...over,
}, process.env.JWT_SECRET, { expiresIn: '1h' });
const auth = (over) => ({ Authorization: `Bearer ${token(over)}` });
const comoAlumno = (over = {}) => auth({ userId: 21, tipo: 'ALU', role: ['alumno'], modules: [], permissions: {}, ...over });
const comoTutor = (over = {}) => auth({ userId: 22, tipo: 'TUT', role: ['tutor'], modules: [], permissions: {}, ...over });

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
const PDF = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(64, 2)]);

// ─── Reglas puras ─────────────────────────────────────────────────────────
describe('edu/cuotasReglas: config', () => {
  it('sin config → defaults del rubro (vence 10, recargos 15/25, descuento 25/30 tope 30)', () => {
    const c = R.normalizarConfig(null);
    expect(c.dia_vencimiento).to.equal(10);
    expect(c.recargos).to.deep.equal([{ desde_dia: 11, porcentaje: 15 }, { desde_dia: 21, porcentaje: 25 }]);
    expect(c.descuento_multi_clase.escalones.map((e) => e.porcentaje)).to.deep.equal([25, 30]);
    expect(c.descuento_multi_clase.tope).to.equal(30);
  });

  it('config vieja de la migración 015 (valor 0) = sin descuento, no se pisa con el default', () => {
    const c = R.normalizarConfig({ descuento_multi_clase: { tipo: 'porcentaje', valor: 0 } });
    expect(R.porcentajeDescuento(3, c)).to.equal(0);
  });

  it('config vieja con valor 20 → 20% desde el 2º instrumento', () => {
    const c = R.normalizarConfig({ descuento_multi_clase: { tipo: 'porcentaje', valor: 20 } });
    expect(R.porcentajeDescuento(1, c)).to.equal(0);
    expect(R.porcentajeDescuento(2, c)).to.equal(20);
    expect(R.porcentajeDescuento(5, c)).to.equal(20);
  });

  it('descarta escalones y recargos inválidos y respeta lo configurado', () => {
    const c = R.normalizarConfig({
      dia_vencimiento: 5,
      recargos: [{ desde_dia: 6, porcentaje: 10 }, { desde_dia: 99, porcentaje: 10 }, { desde_dia: 8, porcentaje: 500 }],
      descuento_multi_clase: { escalones: [{ desde_instrumentos: 1, porcentaje: 50 }, { desde_instrumentos: 2, porcentaje: 15 }], tope: 12 },
    });
    expect(c.dia_vencimiento).to.equal(5);
    expect(c.recargos).to.deep.equal([{ desde_dia: 6, porcentaje: 10 }]);
    expect(c.descuento_multi_clase.escalones).to.deep.equal([{ desde_instrumentos: 2, porcentaje: 15 }]);
    expect(R.porcentajeDescuento(2, c)).to.equal(12); // el tope manda
  });
});

describe('edu/cuotasReglas: descuento por instrumentos', () => {
  it('1 → 0%, 2 → 25%, 3 → 30%, 4 o más → 30% (tope)', () => {
    expect([1, 2, 3, 4, 7].map((n) => R.porcentajeDescuento(n, CFG))).to.deep.equal([0, 25, 30, 30, 30]);
  });

  it('el instrumento de alta más antigua no lleva descuento; los más recientes sí', () => {
    const m = R.asignarDescuentos([
      { id: 3, fecha_alta: '2026-09-01' }, { id: 1, fecha_alta: '2026-03-01' }, { id: 2, fecha_alta: '2026-05-10' },
    ], CFG);
    expect(m.get(1)).to.equal(0);
    expect(m.get(2)).to.equal(30);
    expect(m.get(3)).to.equal(30);
  });

  it('con dos instrumentos, el segundo (alta más reciente) lleva 25%', () => {
    const m = R.asignarDescuentos([{ id: 5, fecha_alta: '2026-02-01' }, { id: 4, fecha_alta: '2026-01-01' }], CFG);
    expect([m.get(4), m.get(5)]).to.deep.equal([0, 25]);
  });

  it('misma fecha de alta: desempata el id menor como principal', () => {
    const m = R.asignarDescuentos([{ id: 9, fecha_alta: '2026-03-01' }, { id: 8, fecha_alta: '2026-03-01' }], CFG);
    expect([m.get(8), m.get(9)]).to.deep.equal([0, 25]);
  });

  it('un solo instrumento no tiene descuento', () => {
    expect(R.asignarDescuentos([{ id: 1, fecha_alta: '2026-03-01' }], CFG).get(1)).to.equal(0);
  });
});

describe('edu/cuotasReglas: clases del mes y proporcional', () => {
  const lunMie = [{ dia_semana: 1 }, { dia_semana: 3 }];

  it('cuenta las clases de un mes real (lunes y miércoles de octubre 2026 = 8)', () => {
    expect(R.contarClases(lunMie, '2026-10-01', '2026-10-31')).to.equal(8);
  });

  it('desde el alta: del 15/10 quedan 4 de 8', () => {
    expect(R.contarClases(lunMie, '2026-10-15', '2026-10-31')).to.equal(4);
  });

  it('el día del alta cuenta (alta un lunes con clase ese lunes)', () => {
    expect(R.contarClases([{ dia_semana: 1 }], '2026-10-19', '2026-10-31')).to.equal(2); // 19 y 26
  });

  it('un horario por día = una clase por semana; dos horarios el mismo día = dos clases', () => {
    expect(R.contarClases([{ dia_semana: 1 }, { dia_semana: 1 }], '2026-10-01', '2026-10-31')).to.equal(8);
  });

  it('febrero 2027 (28 días) = 4 semanas completas', () => {
    expect(R.contarClases([{ dia_semana: 2 }], '2027-02-01', '2027-02-28')).to.equal(4);
  });

  it('proporcional: 80.000 con 4 de 8 clases = 40.000', () => {
    expect(R.cuotaProporcional(80000, 8, 4)).to.equal(40000);
  });

  it('proporcional redondea a centavos y no pasa del mensual', () => {
    expect(R.cuotaProporcional(10000, 3, 1)).to.equal(3333.33);
    expect(R.cuotaProporcional(10000, 8, 8)).to.equal(10000);
    expect(R.cuotaProporcional(10000, 8, 9)).to.equal(10000);
  });

  it('mes sin clases computables → cuota completa (no divide por cero)', () => {
    expect(R.cuotaProporcional(10000, 0, 0)).to.equal(10000);
  });

  it('periodosEntre: del mes de alta al actual, inclusive', () => {
    expect(R.periodosEntre('2026-09-20', '2026-11-03')).to.deep.equal(['2026-09-01', '2026-10-01', '2026-11-01']);
    expect(R.periodosEntre('2026-11-05', '2026-11-30')).to.deep.equal(['2026-11-01']);
  });
});

describe('edu/cuotasReglas: vencimiento y recargo', () => {
  const cuota = (extra = {}) => ({ periodo: '2026-10-01', vence: '2026-10-10', ...extra });

  it('vence el día 10 del mes', () => {
    expect(R.vencimientoDe('2026-10-01', null, CFG)).to.equal('2026-10-10');
  });

  it('alta posterior al 10: vence el día del alta', () => {
    expect(R.vencimientoDe('2026-10-01', '2026-10-17', CFG)).to.equal('2026-10-17');
    expect(R.vencimientoDe('2026-10-01', '2026-10-04', CFG)).to.equal('2026-10-10');
  });

  it('hasta el vencimiento inclusive: sin recargo', () => {
    expect(R.recargoPct(cuota(), '2026-10-03', CFG)).to.equal(0);
    expect(R.recargoPct(cuota(), '2026-10-10', CFG)).to.equal(0);
  });

  it('día 11 a 20: 15%; día 21 en adelante: 25%', () => {
    expect([11, 15, 20].map((d) => R.recargoPct(cuota(), `2026-10-${d}`, CFG))).to.deep.equal([15, 15, 15]);
    expect([21, 25, 31].map((d) => R.recargoPct(cuota(), `2026-10-${d}`, CFG))).to.deep.equal([25, 25, 25]);
  });

  it('mes siguiente o posterior: 25% fijo, no acumula', () => {
    expect(R.recargoPct(cuota(), '2026-11-02', CFG)).to.equal(25);
    expect(R.recargoPct(cuota(), '2026-12-28', CFG)).to.equal(25);
    expect(R.recargoPct(cuota(), '2027-03-01', CFG)).to.equal(25);
  });

  it('el recargo se calcula sobre la fecha de pago, no sobre hoy', () => {
    const { lineas, total } = R.calcularLineas([{ id: 1, importe: '10000.00', periodo: '2026-10-01', vence: '2026-10-10' }], '2026-10-09', CFG);
    expect(lineas[0].recargo_pct).to.equal(0);
    expect(total).to.equal(10000);
    expect(R.calcularLineas([{ id: 1, importe: '10000.00', periodo: '2026-10-01', vence: '2026-10-10' }], '2026-10-12', CFG).total).to.equal(11500);
  });

  it('alta tardía: los escalones se corren con el vencimiento (alta 17/10 → 15% desde el 18)', () => {
    const c = cuota({ vence: '2026-10-17' });
    expect(R.recargoPct(c, '2026-10-17', CFG)).to.equal(0);
    expect(R.recargoPct(c, '2026-10-18', CFG)).to.equal(15);
    expect(R.recargoPct(c, '2026-10-27', CFG)).to.equal(15);
    expect(R.recargoPct(c, '2026-10-28', CFG)).to.equal(25);
  });

  it('varias cuotas: cada una con su recargo (una del mes y otra vencida)', () => {
    const { lineas, total } = R.calcularLineas([
      { id: 1, importe: 10000, periodo: '2026-09-01', vence: '2026-09-10' },
      { id: 2, importe: 10000, periodo: '2026-10-01', vence: '2026-10-10' },
    ], '2026-10-08', CFG);
    expect(lineas.map((l) => l.recargo_pct)).to.deep.equal([25, 0]);
    expect(total).to.equal(22500);
  });

  it('fuera de término: alguna cuota ya vencida a la fecha de subida', () => {
    const cs = [{ vence: '2026-10-10' }];
    expect(R.fueraDeTermino(cs, '2026-10-10')).to.equal(false);
    expect(R.fueraDeTermino(cs, '2026-10-11')).to.equal(true);
  });
});

describe('edu/cuotasReglas: comprobantes', () => {
  it('detecta el tipo por la firma, no por el nombre', () => {
    expect(R.detectarTipo(PNG)).to.equal('image/png');
    expect(R.detectarTipo(PDF)).to.equal('application/pdf');
    expect(R.detectarTipo(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32)]))).to.equal('image/jpeg');
    expect(R.detectarTipo(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(8)]))).to.equal('image/webp');
  });

  it('rechaza ejecutables, html y buffers chicos', () => {
    expect(R.detectarTipo(Buffer.from('<html><script>alert(1)</script></html>'))).to.equal(null);
    expect(R.detectarTipo(Buffer.from('MZ\u0090\u0000\u0003\u0000\u0000\u0000\u0004\u0000\u0000\u0000ÿÿ'))).to.equal(null);
    expect(R.detectarTipo(Buffer.from('%PDF'))).to.equal(null);
    expect(R.detectarTipo(null)).to.equal(null);
  });
});

// ─── Generación ───────────────────────────────────────────────────────────
describe('edu/cuotasService: generación', () => {
  const insc = (id, alumno_id, fecha_alta, precio = 80000, horarios = [{ dia_semana: 1 }, { dia_semana: 3 }]) => (
    { id, alumno_id, fecha_alta, fecha_baja: null, precio, horarios, clase: `Clase ${id}` });
  let insertadas;
  beforeEach(() => {
    insertadas = [];
    sinon.stub(db, 'configAlumnos').resolves(null);
    sinon.stub(db, 'cuotasExistentes').resolves([]);
    sinon.stub(db, 'insertarCuota').callsFake(async (cid, c) => { insertadas.push({ cid, ...c }); return { id: insertadas.length }; });
  });

  it('período inválido → 400', async () => {
    let err;
    try { await cuotasService.generarPeriodo(40, '2026-13'); } catch (e) { err = e; }
    expect(err.status).to.equal(400);
    expect(err.field).to.equal('periodo');
  });

  it('cuota mensual: snapshot del precio, vence el 10, sin descuento', async () => {
    sinon.stub(db, 'inscripcionesDelPeriodo').resolves([insc(1, 10, '2026-03-02')]);
    const r = await cuotasService.generarPeriodo(40, '2026-10');
    expect(r).to.include({ periodo: '2026-10-01', creadas: 1 });
    expect(insertadas[0]).to.include({
      cid: 40, inscripcion_id: 1, alumno_id: 10, tipo: 'mensual', importe_base: 80000, importe: 80000,
      descuento_pct: 0, clases_mes: 8, clases_cobradas: 8, vence: '2026-10-10',
    });
  });

  it('dos instrumentos: el de alta más reciente lleva 25% sobre su cuota', async () => {
    sinon.stub(db, 'inscripcionesDelPeriodo').resolves([insc(1, 10, '2026-03-02'), insc(2, 10, '2026-08-03', 60000)]);
    await cuotasService.generarPeriodo(40, '2026-10');
    const por = Object.fromEntries(insertadas.map((c) => [c.inscripcion_id, c]));
    expect(por[1]).to.include({ descuento_pct: 0, importe: 80000 });
    expect(por[2]).to.include({ descuento_pct: 25, importe: 45000, importe_base: 60000 });
  });

  it('tres instrumentos: 30% en los dos más recientes', async () => {
    sinon.stub(db, 'inscripcionesDelPeriodo').resolves([
      insc(1, 10, '2026-01-05'), insc(2, 10, '2026-02-02', 50000), insc(3, 10, '2026-03-02', 50000)]);
    await cuotasService.generarPeriodo(40, '2026-10');
    expect(insertadas.map((c) => c.descuento_pct)).to.deep.equal([0, 30, 30]);
    expect(insertadas[1].importe).to.equal(35000);
  });

  it('cuatro instrumentos: sigue en 30% (tope)', async () => {
    sinon.stub(db, 'inscripcionesDelPeriodo').resolves([
      insc(1, 10, '2026-01-05'), insc(2, 10, '2026-02-02'), insc(3, 10, '2026-03-02'), insc(4, 10, '2026-04-06')]);
    await cuotasService.generarPeriodo(40, '2026-10');
    expect(insertadas.map((c) => c.descuento_pct)).to.deep.equal([0, 30, 30, 30]);
  });

  it('el descuento es por alumno: dos alumnos con un instrumento cada uno no se descuentan', async () => {
    sinon.stub(db, 'inscripcionesDelPeriodo').resolves([insc(1, 10, '2026-03-02'), insc(2, 11, '2026-03-02')]);
    await cuotasService.generarPeriodo(40, '2026-10');
    expect(insertadas.map((c) => c.descuento_pct)).to.deep.equal([0, 0]);
  });

  it('mes de alta: cuota mensual / clases del mes × clases que quedan (15/10 → 4 de 8)', async () => {
    sinon.stub(db, 'inscripcionesDelPeriodo').resolves([insc(1, 10, '2026-10-15')]);
    await cuotasService.generarPeriodo(40, '2026-10');
    expect(insertadas[0]).to.include({
      tipo: 'alta', clases_mes: 8, clases_cobradas: 4, importe_base: 80000, importe: 40000, vence: '2026-10-15',
    });
  });

  it('mes de alta con descuento: el descuento se aplica sobre la cuota proporcional', async () => {
    sinon.stub(db, 'inscripcionesDelPeriodo').resolves([insc(1, 10, '2026-03-02'), insc(2, 10, '2026-10-15', 80000)]);
    await cuotasService.generarPeriodo(40, '2026-10');
    const alta = insertadas.find((c) => c.inscripcion_id === 2);
    expect(alta).to.include({ tipo: 'alta', descuento_pct: 25, importe: 30000 }); // 40.000 × 0,75
  });

  it('idempotente: lo ya generado no se vuelve a insertar ni cambia', async () => {
    sinon.stub(db, 'inscripcionesDelPeriodo').resolves([insc(1, 10, '2026-03-02'), insc(2, 10, '2026-08-03')]);
    db.cuotasExistentes.resolves([1, 2]);
    const r = await cuotasService.generarPeriodo(40, '2026-10');
    expect(r).to.include({ creadas: 0, existentes: 2 });
    expect(insertadas).to.have.length(0);
  });

  it('carrera con otra corrida: ON CONFLICT devuelve null y no cuenta como creada', async () => {
    sinon.stub(db, 'inscripcionesDelPeriodo').resolves([insc(1, 10, '2026-03-02')]);
    db.insertarCuota.resolves(null);
    const r = await cuotasService.generarPeriodo(40, '2026-10');
    expect(r).to.include({ creadas: 0, existentes: 1 });
  });

  it('la existencia de una cuota previa no rompe el descuento de las nuevas (cuenta todas las vigentes)', async () => {
    sinon.stub(db, 'inscripcionesDelPeriodo').resolves([insc(1, 10, '2026-03-02'), insc(2, 10, '2026-08-03')]);
    db.cuotasExistentes.resolves([1]);
    await cuotasService.generarPeriodo(40, '2026-10');
    expect(insertadas).to.have.length(1);
    expect(insertadas[0]).to.include({ inscripcion_id: 2, descuento_pct: 25 });
  });

  it('sin precio vigente: no genera y lo informa', async () => {
    sinon.stub(db, 'inscripcionesDelPeriodo').resolves([insc(1, 10, '2026-03-02', null)]);
    const r = await cuotasService.generarPeriodo(40, '2026-10');
    expect(r.creadas).to.equal(0);
    expect(r.sin_precio).to.deep.equal([{ inscripcion_id: 1, clase: 'Clase 1' }]);
  });

  it('usa la config de la academia (descuento 10% desde el 2º)', async () => {
    db.configAlumnos.resolves({ descuento_multi_clase: { tipo: 'porcentaje', escalones: [{ desde_instrumentos: 2, porcentaje: 10 }], tope: 10 } });
    sinon.stub(db, 'inscripcionesDelPeriodo').resolves([insc(1, 10, '2026-03-02'), insc(2, 10, '2026-08-03')]);
    await cuotasService.generarPeriodo(40, '2026-10');
    expect(insertadas[1].descuento_pct).to.equal(10);
  });

  it('al inscribir: genera desde el mes de alta hasta el actual (retroactivo incluido)', async () => {
    const q = sinon.stub(db, 'inscripcionesDelPeriodo').resolves([]);
    const r = await cuotasService.generarParaAlta(40, { alumno_id: 10, fecha_alta: '2026-08-20' }, '2026-10-15');
    expect(r.map((x) => x.periodo)).to.deep.equal(['2026-08-01', '2026-09-01', '2026-10-01']);
    expect(q.firstCall.args[3]).to.equal(10); // sólo ese alumno
  });

  it('al inscribir con alta a futuro: no genera nada todavía', async () => {
    const q = sinon.stub(db, 'inscripcionesDelPeriodo').resolves([]);
    const r = await cuotasService.generarParaAlta(40, { alumno_id: 10, fecha_alta: '2026-12-01' }, '2026-10-15');
    expect(r).to.deep.equal([]);
    expect(q.called).to.equal(false);
  });
});

describe('edu/cuotasService: listado con costo de hoy', () => {
  it('suma el recargo vigente a las impagas y deja las pagas como están', () => {
    const r = cuotasService.conCostoHoy([
      { id: 1, importe: '10000.00', periodo: '2026-10-01', vence: '2026-10-10', estado: 'pendiente' },
      { id: 2, importe: '10000.00', periodo: '2026-09-01', vence: '2026-09-10', estado: 'pendiente' },
      { id: 3, importe: '10000.00', periodo: '2026-10-01', vence: '2026-10-10', estado: 'pagada' },
    ], CFG, '2026-10-12');
    expect(r.map((c) => [c.recargo_pct, c.total_hoy])).to.deep.equal([[15, 11500], [25, 12500], [0, 10000]]);
    expect(r[0].vencida).to.equal(true);
  });

  it('filtros inválidos → 400', async () => {
    for (const q of [{ periodo: 'xx' }, { estado: 'inventado' }, { alumno_id: '-3' }]) {
      let err;
      try { await cuotasService.listar(40, q); } catch (e) { err = e; }
      expect(err.status, JSON.stringify(q)).to.equal(400);
    }
  });
});

// ─── Pagos ────────────────────────────────────────────────────────────────
describe('edu/pagosService: admin', () => {
  const cuota = (id, extra = {}) => ({ id, alumno_id: 10, periodo: '2026-10-01', importe: '10000.00', vence: '2026-10-10', estado: 'pendiente', ...extra });
  beforeEach(() => {
    sinon.stub(db, 'configAlumnos').resolves(null);
    sinon.stub(db, 'getPago').resolves({ id: 5 });
  });

  it('entra aprobado, con recargo por la fecha de pago, y marca las cuotas pagadas', async () => {
    sinon.stub(db, 'cuotasPorIds').resolves([cuota(1), cuota(2, { periodo: '2026-09-01', vence: '2026-09-10' })]);
    const ins = sinon.stub(db, 'insertarPago').resolves({ id: 5 });
    const lin = sinon.stub(db, 'insertarLineas').resolves();
    const est = sinon.stub(db, 'setEstadoCuotas').resolves(2);
    await pagosService.registrarAdmin(40, { userId: 7 }, { cuota_ids: [1, 2], fecha_pago: '2026-10-12', medio_pago: 'Efectivo' });
    expect(ins.firstCall.args[1]).to.include({ origen: 'admin', estado: 'aprobado', importe_total: 11500 + 12500, revisado_por: 7 });
    expect(lin.firstCall.args[2].map((l) => [l.cuota_id, l.recargo_pct, l.total])).to.deep.equal([[1, 15, 11500], [2, 25, 12500]]);
    expect(est.calledOnceWithExactly(40, [1, 2], 'pagada')).to.equal(true);
  });

  it('cuota en revisión → 409 y no inserta nada', async () => {
    sinon.stub(db, 'cuotasPorIds').resolves([cuota(1, { estado: 'en_revision' })]);
    const ins = sinon.stub(db, 'insertarPago');
    let err;
    try { await pagosService.registrarAdmin(40, { userId: 7 }, { cuota_ids: [1] }); } catch (e) { err = e; }
    expect(err.status).to.equal(409);
    expect(err.code).to.equal('CUOTA_NO_PAGABLE');
    expect(ins.called).to.equal(false);
  });

  it('cuota ya paga o de otro tenant (no vuelve de la base) → 404/409', async () => {
    sinon.stub(db, 'cuotasPorIds').resolves([]);
    let err;
    try { await pagosService.registrarAdmin(40, { userId: 7 }, { cuota_ids: [99] }); } catch (e) { err = e; }
    expect(err.status).to.equal(404);
    expect(err.code).to.equal('CUOTA_NO_ENCONTRADA');
    db.cuotasPorIds.resolves([cuota(1, { estado: 'pagada' })]);
    try { await pagosService.registrarAdmin(40, { userId: 7 }, { cuota_ids: [1] }); } catch (e) { err = e; }
    expect(err.status).to.equal(409);
  });

  it('valida cuota_ids y fecha: vacío, no numérico, fecha futura o imposible', async () => {
    for (const body of [{}, { cuota_ids: [] }, { cuota_ids: ['a'] }, { cuota_ids: [1], fecha_pago: '2099-01-01' }, { cuota_ids: [1], fecha_pago: '2026-02-30' }]) {
      let err;
      try { await pagosService.registrarAdmin(40, { userId: 7 }, body); } catch (e) { err = e; }
      expect(err.status, JSON.stringify(body)).to.equal(400);
    }
  });

  it('pide las cuotas bloqueadas y filtradas por tenant', async () => {
    const q = sinon.stub(db, 'cuotasPorIds').resolves([cuota(1)]);
    sinon.stub(db, 'insertarPago').resolves({ id: 5 });
    sinon.stub(db, 'insertarLineas').resolves();
    sinon.stub(db, 'setEstadoCuotas').resolves(1);
    await pagosService.registrarAdmin(40, { userId: 7 }, { cuota_ids: [1, 1] });
    expect(q.firstCall.args).to.deep.equal([40, [1], {}, true]); // duplicados colapsados
  });
});

describe('edu/pagosService: alumno y tutor', () => {
  const cuota = (id, extra = {}) => ({ id, alumno_id: 10, periodo: '2026-10-01', importe: '10000.00', vence: '2026-10-10', estado: 'pendiente', ...extra });
  const archivo = (buffer = PNG, extra = {}) => ({ buffer, originalname: 'transferencia.png', ...extra });
  let sub; let ins; let est;
  beforeEach(() => {
    sub = sinon.stub(storage, 'subir').resolves({ provider: 'cloudinary', key: 'edu/comprobantes/40/abc', meta: { format: 'png' }, bytes: 72 });
    sinon.stub(storage, 'borrar').resolves(true);
    sinon.stub(db, 'cuotasPorIds').resolves([cuota(1)]);
    ins = sinon.stub(db, 'insertarPago').resolves({ id: 8 });
    sinon.stub(db, 'insertarLineas').resolves();
    est = sinon.stub(db, 'setEstadoCuotas').resolves(1);
    sinon.stub(db, 'getPago').resolves({ id: 8 });
  });

  it('sube el comprobante, deja el pago pendiente y las cuotas en revisión', async () => {
    await pagosService.crearPortal(40, { userId: 21, tipo: 'ALU' }, { alumno_id: 10 }, { cuota_ids: '[1]', fecha_pago: '2026-10-05' }, archivo());
    expect(sub.firstCall.args[0].folder).to.equal('edu/comprobantes/40');
    const p = ins.firstCall.args[1];
    expect(p).to.include({ origen: 'portal', estado: 'pendiente', pagador_user_id: 21, fecha_pago: '2026-10-05' });
    expect(p.comprobante).to.include({ provider: 'cloudinary', key: 'edu/comprobantes/40/abc', mime: 'image/png', nombre: 'transferencia.png' });
    expect(est.calledOnceWithExactly(40, [1], 'en_revision')).to.equal(true);
  });

  it('el alcance se pasa al buscar las cuotas: una cuota ajena no se puede pagar', async () => {
    db.cuotasPorIds.resolves([]);
    let err;
    try { await pagosService.crearPortal(40, { userId: 21, tipo: 'ALU' }, { alumno_id: 10 }, { cuota_ids: [77] }, archivo()); } catch (e) { err = e; }
    expect(err.status).to.equal(404);
    expect(db.cuotasPorIds.firstCall.args[2]).to.deep.equal({ alumno_id: 10 });
    expect(sub.called).to.equal(false);
  });

  it('subido después del vencimiento queda marcado fuera de término (hoy > vence)', async () => {
    db.cuotasPorIds.resolves([cuota(1, { vence: '2000-01-10', periodo: '2000-01-01' })]);
    await pagosService.crearPortal(40, { userId: 22, tipo: 'TUT' }, { tutor_id: 3 }, { cuota_ids: [1], fecha_pago: '2000-01-09' }, archivo(PDF, { originalname: 'x.pdf' }));
    expect(ins.firstCall.args[1].fuera_de_termino).to.equal(true);
    expect(ins.firstCall.args[1].comprobante.mime).to.equal('application/pdf');
  });

  it('en término no se marca', async () => {
    db.cuotasPorIds.resolves([cuota(1, { vence: '2999-01-10', periodo: '2999-01-01' })]);
    await pagosService.crearPortal(40, { userId: 22, tipo: 'TUT' }, { tutor_id: 3 }, { cuota_ids: [1] }, archivo());
    expect(ins.firstCall.args[1].fuera_de_termino).to.equal(false);
  });

  it('sin archivo → 400 COMPROBANTE_REQUERIDO; formato falso → 400; pesado → 400', async () => {
    const casos = [
      [null, 'COMPROBANTE_REQUERIDO'],
      [archivo(Buffer.from('<script>alert(1)</script>'.padEnd(40, ' ')), { originalname: 'a.png' }), 'COMPROBANTE_INVALIDO'],
      [archivo(Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)])), 'COMPROBANTE_GRANDE'],
    ];
    for (const [a, code] of casos) {
      let err;
      try { await pagosService.crearPortal(40, { userId: 21, tipo: 'ALU' }, { alumno_id: 10 }, { cuota_ids: [1] }, a); } catch (e) { err = e; }
      expect(err.code).to.equal(code);
      expect(err.status).to.equal(400);
    }
    expect(sub.called).to.equal(false);
  });

  it('un profesor no puede informar pagos → 403', async () => {
    let err;
    try { await pagosService.crearPortal(40, { userId: 5, tipo: 'PROF' }, { profesor_id: 2 }, { cuota_ids: [1] }, archivo()); } catch (e) { err = e; }
    expect(err.status).to.equal(403);
  });

  it('si la base falla después de subir, borra el archivo (sin huérfanos) y propaga', async () => {
    ins.rejects(new Error('db caída'));
    let err;
    try { await pagosService.crearPortal(40, { userId: 21, tipo: 'ALU' }, { alumno_id: 10 }, { cuota_ids: [1] }, archivo()); } catch (e) { err = e; }
    expect(err.message).to.equal('db caída');
    expect(storage.borrar.calledOnce).to.equal(true);
    expect(storage.borrar.firstCall.args[0].key).to.equal('edu/comprobantes/40/abc');
  });

  it('si el storage falla, no toca la base', async () => {
    sub.rejects(new storage.StorageError('No se pudo guardar el archivo'));
    let err;
    try { await pagosService.crearPortal(40, { userId: 21, tipo: 'ALU' }, { alumno_id: 10 }, { cuota_ids: [1] }, archivo()); } catch (e) { err = e; }
    expect(err.status).to.equal(502);
    expect(ins.called).to.equal(false);
    expect(est.called).to.equal(false);
  });
});

describe('edu/pagosService: revisión del admin', () => {
  const pendiente = { id: 8, estado: 'pendiente' };
  const cuotas = [{ id: 1, alumno_id: 10, periodo: '2026-10-01', importe: '10000.00', vence: '2026-10-10', estado: 'en_revision' }];
  beforeEach(() => {
    sinon.stub(db, 'configAlumnos').resolves(null);
    sinon.stub(db, 'getPago').resolves(pendiente);
    sinon.stub(db, 'cuotasDePago').resolves(cuotas);
  });

  it('aprobar: el recargo se calcula sobre la fecha que confirma el admin', async () => {
    const act = sinon.stub(db, 'actualizarLinea').resolves(1);
    const apr = sinon.stub(db, 'aprobarPago').resolves(1);
    const est = sinon.stub(db, 'setEstadoCuotas').resolves(1);
    await pagosService.aprobar(40, 8, { userId: 7 }, { fecha_pago: '2026-10-14' });
    expect(act.firstCall.args[2]).to.include({ cuota_id: 1, recargo_pct: 15, total: 11500 });
    expect(apr.firstCall.args[2]).to.include({ fecha_pago: '2026-10-14', importe_total: 11500, revisado_por: 7 });
    expect(est.calledOnceWithExactly(40, [1], 'pagada')).to.equal(true);
  });

  it('aprobar con una fecha en término → sin recargo, aunque se apruebe tarde', async () => {
    sinon.stub(db, 'actualizarLinea').resolves(1);
    const apr = sinon.stub(db, 'aprobarPago').resolves(1);
    sinon.stub(db, 'setEstadoCuotas').resolves(1);
    await pagosService.aprobar(40, 8, { userId: 7 }, { fecha_pago: '2026-10-09' });
    expect(apr.firstCall.args[2].importe_total).to.equal(10000);
  });

  it('aprobar exige la fecha', async () => {
    let err;
    try { await pagosService.aprobar(40, 8, { userId: 7 }, {}); } catch (e) { err = e; }
    expect(err.status).to.equal(400);
    expect(err.field).to.equal('fecha_pago');
  });

  it('aprobar o rechazar un pago ya revisado → 409; inexistente → 404', async () => {
    db.getPago.resolves({ id: 8, estado: 'aprobado' });
    for (const fn of [() => pagosService.aprobar(40, 8, { userId: 7 }, { fecha_pago: '2026-10-09' }), () => pagosService.rechazar(40, 8, { userId: 7 }, { motivo: 'no se ve' })]) {
      let err;
      try { await fn(); } catch (e) { err = e; }
      expect(err.status).to.equal(409);
      expect(err.code).to.equal('PAGO_YA_REVISADO');
    }
    db.getPago.resolves(null);
    let e404;
    try { await pagosService.aprobar(40, 99, { userId: 7 }, { fecha_pago: '2026-10-09' }); } catch (e) { e404 = e; }
    expect(e404.status).to.equal(404);
  });

  it('rechazar: motivo obligatorio', async () => {
    for (const body of [{}, { motivo: '  ' }, { motivo: 'ab' }, { motivo: 'x'.repeat(501) }]) {
      let err;
      try { await pagosService.rechazar(40, 8, { userId: 7 }, body); } catch (e) { err = e; }
      expect(err.status, JSON.stringify(body).slice(0, 30)).to.equal(400);
    }
  });

  it('rechazar: guarda el motivo y devuelve las cuotas a pendiente (para volver a pagar)', async () => {
    const rech = sinon.stub(db, 'rechazarPago').resolves(1);
    const est = sinon.stub(db, 'setEstadoCuotas').resolves(1);
    await pagosService.rechazar(40, 8, { userId: 7 }, { motivo: ' El comprobante no se lee ' });
    expect(rech.firstCall.args[2]).to.deep.equal({ motivo: 'El comprobante no se lee', revisado_por: 7 });
    expect(est.calledOnceWithExactly(40, [1], 'pendiente')).to.equal(true);
  });

  it('el comprobante de un pago propio se pide con el pagador; el de staff, sin filtro', async () => {
    const g = sinon.stub(db, 'getComprobante').resolves({ provider: 'cloudinary', key: 'k', meta: { format: 'png' }, nombre: 'a.png', mime: 'image/png' });
    sinon.stub(cloudinaryProvider, 'signedUrl').returns('https://res.cloudinary.com/x/firmada');
    const r = await pagosService.comprobante(40, 8, 21);
    expect(g.firstCall.args).to.deep.equal([40, 8, 21]);
    expect(r).to.include({ url: 'https://res.cloudinary.com/x/firmada', expira_en: 300, mime: 'image/png' });
    await pagosService.comprobante(40, 8);
    expect(g.secondCall.args).to.deep.equal([40, 8, null]);
  });

  it('comprobante inexistente (o de otro usuario) → 404', async () => {
    sinon.stub(db, 'getComprobante').resolves(null);
    let err;
    try { await pagosService.comprobante(40, 8, 21); } catch (e) { err = e; }
    expect(err.status).to.equal(404);
  });
});

describe('edu/pagosService: vista previa del cálculo', () => {
  const cuota = (id, extra = {}) => ({ id, alumno_id: 10, periodo: '2026-10-01', importe: '10000.00', vence: '2026-10-10', estado: 'pendiente', ...extra });
  beforeEach(() => sinon.stub(db, 'configAlumnos').resolves(null));

  it('por cuota_ids: calcula el recargo a la fecha pedida y no escribe nada', async () => {
    sinon.stub(db, 'cuotasPorIds').resolves([cuota(1)]);
    const ins = sinon.stub(db, 'insertarPago');
    const r = await pagosService.calcular(40, { cuota_ids: [1], fecha_pago: '2026-10-12' });
    expect(r.total).to.equal(11500);
    expect(r.lineas[0]).to.include({ cuota_id: 1, recargo_pct: 15, periodo: '2026-10-01', vence: '2026-10-10' });
    expect(db.cuotasPorIds.firstCall.args[3]).to.equal(false); // sin FOR UPDATE
    expect(ins.called).to.equal(false);
  });

  it('por pago_id: usa las cuotas del pago (en revisión) sin bloquearlas', async () => {
    sinon.stub(db, 'getPago').resolves({ id: 8 });
    const c = sinon.stub(db, 'cuotasDePago').resolves([cuota(1, { estado: 'en_revision' })]);
    const r = await pagosService.calcular(40, { pago_id: 8, fecha_pago: '2026-10-09' });
    expect(r.total).to.equal(10000);
    expect(c.firstCall.args).to.deep.equal([40, 8, false]);
  });

  it('pago de otro tenant → 404; cuota paga → 409; cuota inexistente → 404', async () => {
    sinon.stub(db, 'getPago').resolves(null);
    let e1; let e2; let e3;
    try { await pagosService.calcular(40, { pago_id: 99 }); } catch (e) { e1 = e; }
    sinon.stub(db, 'cuotasPorIds').resolves([cuota(1, { estado: 'pagada' })]);
    try { await pagosService.calcular(40, { cuota_ids: [1] }); } catch (e) { e2 = e; }
    db.cuotasPorIds.resolves([]);
    try { await pagosService.calcular(40, { cuota_ids: [5] }); } catch (e) { e3 = e; }
    expect([e1.status, e2.status, e3.status]).to.deep.equal([404, 409, 404]);
  });

  it('HTTP: lo puede pedir quien lista (alumnos.list); un alumno no (403)', async () => {
    sinon.stub(catalogoDb, 'tenantTieneModulo').resolves(true);
    sinon.stub(pagosService, 'calcular').resolves({ total: 1, lineas: [], fecha_pago: '2026-10-01' });
    const ok = await request(app).post('/api/edu/pagos/calcular').set(auth({ role: ['empleado'], tipo: 'EMP', permissions: { alumnos: ['alumnos.list'] } })).send({ cuota_ids: [1] });
    expect(ok.status).to.equal(200);
    expect((await request(app).post('/api/edu/pagos/calcular').set(comoAlumno()).send({ cuota_ids: [1] })).status).to.equal(403);
  });
});

// ─── Storage genérico ─────────────────────────────────────────────────────
describe('services/storage', () => {
  it('sube por el proveedor activo y devuelve provider + key + meta para guardar en la base', async () => {
    const up = sinon.stub(cloudinaryProvider, 'upload').resolves({ key: 'edu/c/1', bytes: 10, meta: { format: 'png' } });
    const r = await storage.subir({ buffer: PNG, folder: 'edu/comprobantes/40', nombre: 'n1' });
    expect(up.firstCall.args[0]).to.include({ folder: 'edu/comprobantes/40', filename: 'n1' });
    expect(r).to.deep.equal({ provider: 'cloudinary', key: 'edu/c/1', meta: { format: 'png' }, bytes: 10 });
  });

  it('un fallo del proveedor sale como StorageError 502 sin filtrar el detalle', async () => {
    sinon.stub(cloudinaryProvider, 'upload').rejects(new Error('Invalid api_key abc123'));
    let err;
    try { await storage.subir({ buffer: PNG, folder: 'f' }); } catch (e) { err = e; }
    expect(err).to.be.instanceOf(storage.StorageError);
    expect(err.status).to.equal(502);
    expect(err.message).to.not.include('api_key');
  });

  it('archivo vacío o sin carpeta → error', async () => {
    let e1; let e2;
    try { await storage.subir({ buffer: Buffer.alloc(0), folder: 'f' }); } catch (e) { e1 = e; }
    try { await storage.subir({ buffer: PNG }); } catch (e) { e2 = e; }
    expect(e1.status).to.equal(400);
    expect(e2.code).to.equal('STORAGE_FOLDER');
  });

  it('proveedor desconocido (STORAGE_PROVIDER mal puesto) → error claro', async () => {
    process.env.STORAGE_PROVIDER = 's3-todavia-no';
    let err;
    try { await storage.subir({ buffer: PNG, folder: 'f' }); } catch (e) { err = e; }
    expect(err.code).to.equal('STORAGE_PROVEEDOR');
  });

  it('los archivos viejos se resuelven por el proveedor guardado, no por el activo', () => {
    process.env.STORAGE_PROVIDER = 's3-todavia-no';
    const s = sinon.stub(cloudinaryProvider, 'signedUrl').returns('https://u');
    expect(storage.urlFirmada({ provider: 'cloudinary', key: 'k', meta: { format: 'pdf' } }, 60)).to.deep.equal({ url: 'https://u', expira_en: 60 });
    expect(s.firstCall.args[0]).to.deep.include({ key: 'k', expiresIn: 60 });
  });

  it('borrar es best-effort: si el proveedor falla devuelve false y no tira', async () => {
    sinon.stub(cloudinaryProvider, 'remove').rejects(new Error('timeout'));
    sinon.stub(console, 'error');
    expect(await storage.borrar({ provider: 'cloudinary', key: 'k' })).to.equal(false);
    expect(await storage.borrar({})).to.equal(false);
  });

  it('proveedor cloudinary: sube privado (authenticated) y firma con vencimiento', async () => {
    const cloudinary = require('../config/cloudinary');
    let opts;
    sinon.stub(cloudinary.uploader, 'upload_stream').callsFake((o, cb) => {
      opts = o;
      return { end: () => cb(null, { public_id: 'edu/comprobantes/40/z', bytes: 70, resource_type: 'image', type: 'authenticated', format: 'png' }) };
    });
    const r = await cloudinaryProvider.upload({ buffer: PNG, folder: 'edu/comprobantes/40', filename: 'z' });
    expect(opts).to.include({ type: 'authenticated', folder: 'edu/comprobantes/40', public_id: 'z' });
    expect(r.meta).to.deep.equal({ resource_type: 'image', type: 'authenticated', format: 'png' });

    const dl = sinon.stub(cloudinary.utils, 'private_download_url').returns('https://api.cloudinary.com/dl');
    const antes = Math.floor(Date.now() / 1000);
    cloudinaryProvider.signedUrl({ key: 'edu/comprobantes/40/z', meta: r.meta, expiresIn: 300 });
    const [key, format, o] = dl.firstCall.args;
    expect([key, format]).to.deep.equal(['edu/comprobantes/40/z', 'png']);
    expect(o).to.include({ type: 'authenticated', resource_type: 'image' });
    expect(o.expires_at).to.be.within(antes + 299, antes + 302);
  });
});

// ─── Rutas ────────────────────────────────────────────────────────────────
describe('/api/edu cuotas y pagos: acceso', () => {
  beforeEach(() => sinon.stub(catalogoDb, 'tenantTieneModulo').resolves(true));

  it('un alumno no entra a las rutas de administración de pagos (403 ROL_SIN_ACCESO)', async () => {
    for (const [m, p] of [['get', '/api/edu/cuotas'], ['get', '/api/edu/pagos'], ['post', '/api/edu/pagos'], ['post', '/api/edu/pagos/1/aprobar'], ['post', '/api/edu/pagos/1/rechazar'], ['post', '/api/edu/cuotas/generar']]) {
      const r = await request(app)[m](p).set(comoAlumno()).send({});
      expect(r.status, `${m} ${p}`).to.equal(403);
      expect(r.body.code).to.equal('ROL_SIN_ACCESO');
    }
  });

  it('un empleado sin el permiso de la acción no aprueba (403)', async () => {
    const r = await request(app).post('/api/edu/pagos/1/aprobar')
      .set(auth({ role: ['empleado'], tipo: 'EMP', permissions: { alumnos: ['alumnos.list'] } })).send({ fecha_pago: '2026-10-01' });
    expect(r.status).to.equal(403);
  });

  it('sin token → 401', async () => {
    expect((await request(app).get('/api/edu/cuotas')).status).to.equal(401);
    expect((await request(app).post('/api/edu/mis/pagos')).status).to.equal(401);
  });

  it('un profesor no ve cuotas ni informa pagos (403)', async () => {
    sinon.stub(personasDb, 'porUserId').resolves({ id: 2, activo: true });
    const prof = auth({ userId: 5, tipo: 'PROF', role: ['profesor'], modules: [], permissions: {} });
    expect((await request(app).get('/api/edu/mis/cuotas').set(prof)).status).to.equal(403);
    expect((await request(app).post('/api/edu/mis/pagos').set(prof).field('cuota_ids', '[1]')).status).to.equal(403);
  });

  it('el tutor lista las cuotas con el alcance de su ficha (tutor_id)', async () => {
    sinon.stub(personasDb, 'porUserId').resolves({ id: 3, activo: true });
    sinon.stub(db, 'configAlumnos').resolves(null);
    const l = sinon.stub(db, 'listarCuotas').resolves([{ id: 1, importe: '10000.00', periodo: '2026-10-01', vence: '2026-10-10', estado: 'pendiente' }]);
    const r = await request(app).get('/api/edu/mis/cuotas?estado=pendiente').set(comoTutor());
    expect(r.status).to.equal(200);
    expect(l.firstCall.args[0]).to.equal(40);
    expect(l.firstCall.args[2]).to.deep.equal({ tutor_id: 3 });
    expect(r.body[0]).to.have.property('total_hoy');
  });

  it('el alumno ve sólo sus pagos (filtro por pagador)', async () => {
    sinon.stub(personasDb, 'porUserId').resolves({ id: 10, activo: true });
    const l = sinon.stub(db, 'listarPagos').resolves([]);
    await request(app).get('/api/edu/mis/pagos').set(comoAlumno());
    expect(l.firstCall.args[2]).to.equal(21);
  });

  it('el tenant sale del JWT: un cliente_id ajeno en el body se rechaza (403) y no llega al service', async () => {
    sinon.stub(console, 'warn');
    sinon.stub(console, 'error');
    const reg = sinon.stub(pagosService, 'registrarAdmin').resolves({ id: 1 });
    const r = await request(app).post('/api/edu/pagos').set(auth()).send({ cliente_id: 999, cuota_ids: [1] });
    expect(r.status).to.equal(403);
    expect(reg.called).to.equal(false);
    await request(app).post('/api/edu/pagos').set(auth()).send({ cuota_ids: [1] });
    expect(reg.firstCall.args[0]).to.equal(40);
  });
});

describe('POST /api/edu/mis/pagos (multipart)', () => {
  beforeEach(() => {
    sinon.stub(catalogoDb, 'tenantTieneModulo').resolves(true);
    sinon.stub(personasDb, 'porUserId').resolves({ id: 10, activo: true });
  });

  it('sube el comprobante y responde 201 con el pago pendiente', async () => {
    sinon.stub(db, 'cuotasPorIds').resolves([{ id: 1, alumno_id: 10, periodo: '2026-10-01', importe: '10000.00', vence: '2026-10-10', estado: 'pendiente' }]);
    const sub = sinon.stub(storage, 'subir').resolves({ provider: 'cloudinary', key: 'k', meta: {}, bytes: 72 });
    sinon.stub(db, 'insertarPago').resolves({ id: 8 });
    sinon.stub(db, 'insertarLineas').resolves();
    sinon.stub(db, 'setEstadoCuotas').resolves(1);
    sinon.stub(db, 'getPago').resolves({ id: 8, estado: 'pendiente' });
    const r = await request(app).post('/api/edu/mis/pagos').set(comoAlumno())
      .field('cuota_ids', '[1]').field('fecha_pago', '2026-10-05')
      .attach('comprobante', PNG, { filename: 'comp.png', contentType: 'image/png' });
    expect(r.status).to.equal(201);
    expect(r.body.estado).to.equal('pendiente');
    expect(Buffer.isBuffer(sub.firstCall.args[0].buffer)).to.equal(true);
  });

  it('archivo de más de 5 MB → 400 COMPROBANTE_GRANDE (límite de multer)', async () => {
    const r = await request(app).post('/api/edu/mis/pagos').set(comoAlumno())
      .field('cuota_ids', '[1]')
      .attach('comprobante', Buffer.concat([PNG, Buffer.alloc(5.5 * 1024 * 1024)]), { filename: 'g.png', contentType: 'image/png' });
    expect(r.status).to.equal(400);
    expect(r.body.code).to.equal('COMPROBANTE_GRANDE');
  });

  it('archivo disfrazado (html con .png) → 400 COMPROBANTE_INVALIDO', async () => {
    const r = await request(app).post('/api/edu/mis/pagos').set(comoAlumno())
      .field('cuota_ids', '[1]')
      .attach('comprobante', Buffer.from('<html><script>alert(1)</script></html>'), { filename: 'a.png', contentType: 'image/png' });
    expect(r.status).to.equal(400);
    expect(r.body.code).to.equal('COMPROBANTE_INVALIDO');
  });

  it('sin archivo → 400 COMPROBANTE_REQUERIDO', async () => {
    const r = await request(app).post('/api/edu/mis/pagos').set(comoAlumno()).field('cuota_ids', '[1]');
    expect(r.status).to.equal(400);
    expect(r.body.code).to.equal('COMPROBANTE_REQUERIDO');
  });

  it('el link del comprobante es del propio pagador (404 si no es suyo)', async () => {
    const g = sinon.stub(db, 'getComprobante').resolves(null);
    const r = await request(app).get('/api/edu/mis/pagos/8/comprobante').set(comoAlumno());
    expect(r.status).to.equal(404);
    expect(g.firstCall.args).to.deep.equal([40, 8, 21]);
  });
});

describe('/api/edu admin pagos: HTTP', () => {
  beforeEach(() => sinon.stub(catalogoDb, 'tenantTieneModulo').resolves(true));

  it('registrar → 201; aprobar y rechazar → 200 con lo que devuelve el service', async () => {
    sinon.stub(pagosService, 'registrarAdmin').resolves({ id: 1, estado: 'aprobado' });
    const apr = sinon.stub(pagosService, 'aprobar').resolves({ id: 2, estado: 'aprobado' });
    const rech = sinon.stub(pagosService, 'rechazar').resolves({ id: 3, estado: 'rechazado' });
    expect((await request(app).post('/api/edu/pagos').set(auth()).send({ cuota_ids: [1] })).status).to.equal(201);
    expect((await request(app).post('/api/edu/pagos/2/aprobar').set(auth()).send({ fecha_pago: '2026-10-01' })).status).to.equal(200);
    expect((await request(app).post('/api/edu/pagos/3/rechazar').set(auth()).send({ motivo: 'ilegible' })).status).to.equal(200);
    expect(apr.firstCall.args.slice(0, 2)).to.deep.equal([40, 2]);
    expect(rech.firstCall.args[3]).to.deep.equal({ motivo: 'ilegible', cliente_id: 40 });
  });

  it('errores de negocio salen con status, code y field', async () => {
    sinon.stub(db, 'getPago').resolves({ id: 8, estado: 'rechazado' });
    const r = await request(app).post('/api/edu/pagos/8/rechazar').set(auth()).send({ motivo: 'otra vez' });
    expect(r.status).to.equal(409);
    expect(r.body.code).to.equal('PAGO_YA_REVISADO');
  });

  it('id inválido → 400', async () => {
    const r = await request(app).get('/api/edu/pagos/abc').set(auth());
    expect(r.status).to.equal(400);
  });

  it('/pagos/resumen no se confunde con /pagos/:id', async () => {
    sinon.stub(db, 'contarPendientes').resolves(3);
    const r = await request(app).get('/api/edu/pagos/resumen').set(auth());
    expect(r.status).to.equal(200);
    expect(r.body).to.deep.equal({ pendientes_revision: 3 });
  });
});

// ─── Cron (n8n) ───────────────────────────────────────────────────────────
describe('/api/cron/edu-cuotas', () => {
  const cron = { Authorization: `Bearer ${process.env.CRON_SECRET}` };

  it('sin el secreto → 401 en las tres rutas', async () => {
    expect((await request(app).post('/api/cron/edu-cuotas/generar')).status).to.equal(401);
    expect((await request(app).get('/api/cron/edu-cuotas/pendientes-revision')).status).to.equal(401);
    expect((await request(app).post('/api/cron/edu-cuotas/pendientes-revision/avisados').send({ ids: [1] })).status).to.equal(401);
  });

  it('un JWT de usuario no sirve como secreto de cron', async () => {
    expect((await request(app).post('/api/cron/edu-cuotas/generar').set(auth())).status).to.equal(401);
  });

  it('generar: recorre todas las academias, cada una en su transacción, y un error no frena al resto', async () => {
    sinon.stub(db, 'clientesConAlumnos').resolves([40, 41, 42]);
    const client = { query: sinon.stub().resolves({ rows: [] }), release: sinon.stub() };
    sinon.stub(pool, 'connect').resolves(client);
    sinon.stub(console, 'error');
    sinon.stub(cuotasService, 'generarPeriodo').callsFake(async (cid, periodo) => {
      if (cid === 41) throw new Error('boom');
      return { periodo, creadas: 2, existentes: 0, sin_precio: [] };
    });
    const r = await request(app).post('/api/cron/edu-cuotas/generar').set(cron).send({ periodo: '2026-11' });
    expect(r.status).to.equal(200);
    expect(r.body).to.include({ periodo: '2026-11-01', clientes: 3, creadas: 4, con_error: 1 });
    expect(r.body.resultados.find((x) => x.cliente_id === 41).error).to.equal('boom');
    // 3 tenants → 3 BEGIN, 2 COMMIT, 1 ROLLBACK, 3 release
    const sqls = client.query.getCalls().map((c) => String(c.args[0]).split(' ')[0]);
    expect(sqls.filter((s) => s === 'BEGIN')).to.have.length(3);
    expect(sqls.filter((s) => s === 'COMMIT')).to.have.length(2);
    expect(sqls.filter((s) => s === 'ROLLBACK')).to.have.length(1);
    expect(client.release.callCount).to.equal(3);
    expect(client.query.getCalls().filter((c) => /set_config/.test(c.args[0])).map((c) => c.args[1][0])).to.deep.equal(['40', '41', '42']);
  });

  it('generar con período inválido → 400', async () => {
    const r = await request(app).post('/api/cron/edu-cuotas/generar').set(cron).send({ periodo: 'nov' });
    expect(r.status).to.equal(400);
  });

  it('pendientes-revision: agrupa por academia', async () => {
    sinon.stub(db, 'pendientesSinNotificar').resolves([
      { id: 1, cliente_id: 40, fuera_de_termino: true, fecha_pago: '2026-10-12', created_at: 't', alumnos: 'Ana Pérez', importe: '10000.00' },
      { id: 2, cliente_id: 40, fuera_de_termino: false, fecha_pago: '2026-10-05', created_at: 't', alumnos: 'Luis Gil', importe: '8000.00' },
      { id: 3, cliente_id: 41, fuera_de_termino: false, fecha_pago: '2026-10-05', created_at: 't', alumnos: 'Eva Ríos', importe: '5000.00' },
    ]);
    const r = await request(app).get('/api/cron/edu-cuotas/pendientes-revision').set(cron);
    expect(r.status).to.equal(200);
    expect(r.body.map((x) => [x.cliente_id, x.pagos.length])).to.deep.equal([[40, 2], [41, 1]]);
    expect(r.body[0].pagos[0]).to.include({ id: 1, importe: 10000, fuera_de_termino: true });
  });

  it('avisados: marca sólo ids válidos', async () => {
    const m = sinon.stub(db, 'marcarNotificados').resolves(2);
    const r = await request(app).post('/api/cron/edu-cuotas/pendientes-revision/avisados').set(cron).send({ ids: [1, '2', 2, 'x', -4] });
    expect(r.body).to.deep.equal({ marcados: 2 });
    expect(m.firstCall.args[0]).to.deep.equal([1, 2]);
    expect((await request(app).post('/api/cron/edu-cuotas/pendientes-revision/avisados').set(cron).send({})).body).to.deep.equal({ marcados: 0 });
  });

  it('conTenant revierte y libera la conexión si la tarea falla', async () => {
    const client = { query: sinon.stub().resolves({ rows: [] }), release: sinon.stub() };
    sinon.stub(pool, 'connect').resolves(client);
    let err;
    try { await cuotasCron.conTenant(40, async () => { throw new Error('x'); }); } catch (e) { err = e; }
    expect(err.message).to.equal('x');
    expect(client.query.lastCall.args[0]).to.equal('ROLLBACK');
    expect(client.release.calledOnce).to.equal(true);
  });
});
