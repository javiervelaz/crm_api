// services/edu/cuotasService.js — generación y consulta de cuotas.
const db = require('../../model/edu/cuotas');
const { EduError, hoy, normalizarPeriodo } = require('./reglas');
const R = require('./cuotasReglas');

const configDe = async (cliente_id) => R.normalizarConfig(await db.configAlumnos(cliente_id));

/**
 * Arma la cuota de una inscripción en un período. Pura: no toca la base.
 * Mes de alta → proporcional a las clases que quedan desde el alta.
 */
const armarCuota = (insc, periodo, descuento_pct, cfg) => {
  const ultimo = R.ultimoDia(periodo);
  const esAlta = R.mesDe(insc.fecha_alta) === R.mesDe(periodo);
  const clases_mes = R.contarClases(insc.horarios, periodo, ultimo);
  const clases_cobradas = esAlta ? R.contarClases(insc.horarios, insc.fecha_alta, ultimo) : clases_mes;
  const proporcional = R.cuotaProporcional(insc.precio, clases_mes, clases_cobradas);
  return {
    inscripcion_id: insc.id,
    alumno_id: insc.alumno_id,
    periodo,
    tipo: esAlta ? 'alta' : 'mensual',
    importe_base: R.round2(insc.precio),
    clases_mes,
    clases_cobradas,
    descuento_pct,
    importe: R.round2(proporcional * (1 - descuento_pct / 100)),
    vence: R.vencimientoDe(periodo, esAlta ? insc.fecha_alta : null, cfg),
  };
};

/**
 * Genera las cuotas de un mes. Idempotente: lo ya generado no se toca (sus
 * importes son snapshot), así que se puede correr cuantas veces haga falta.
 * El descuento sale de la cantidad de instrumentos vigentes del alumno en el mes.
 * Devuelve { periodo, creadas, existentes, sin_precio: [{inscripcion_id, clase}] }.
 */
const generarPeriodo = async (cliente_id, periodoEntrada, { alumno_id = null, cfg = null } = {}) => {
  const periodo = normalizarPeriodo(periodoEntrada);
  if (!periodo) throw new EduError('Período inválido (AAAA-MM)', { field: 'periodo' });
  const config = cfg ?? await configDe(cliente_id);

  const insc = await db.inscripcionesDelPeriodo(cliente_id, periodo, R.ultimoDia(periodo), alumno_id);
  const ya = new Set(insc.length ? await db.cuotasExistentes(cliente_id, periodo, insc.map((i) => i.id)) : []);

  const porAlumno = new Map();
  for (const i of insc) porAlumno.set(i.alumno_id, [...(porAlumno.get(i.alumno_id) ?? []), i]);

  const out = { periodo, creadas: 0, existentes: ya.size, sin_precio: [] };
  for (const grupo of porAlumno.values()) {
    const pcts = R.asignarDescuentos(grupo, config);
    for (const i of grupo) {
      if (ya.has(i.id)) continue;
      if (i.precio === null || i.precio === undefined) {
        out.sin_precio.push({ inscripcion_id: i.id, clase: i.clase });
        continue;
      }
      if (!i.horarios.length) continue; // sin horarios no hay clases que cobrar
      // eslint-disable-next-line no-await-in-loop
      const creada = await db.insertarCuota(cliente_id, armarCuota(i, periodo, pcts.get(i.id), config));
      if (creada) out.creadas += 1;
      else out.existentes += 1;
    }
  }
  return out;
};

/**
 * Al inscribir: cuotas del alumno desde el mes de alta hasta el mes actual
 * (un alta a futuro no genera nada; lo hace el cron al llegar el mes).
 */
const generarParaAlta = async (cliente_id, { alumno_id, fecha_alta }, ahora = hoy()) => {
  const cfg = await configDe(cliente_id);
  const periodos = R.periodosEntre(fecha_alta, ahora).filter((p) => p <= R.primerDia(ahora));
  const resultados = [];
  for (const p of periodos) {
    // eslint-disable-next-line no-await-in-loop
    resultados.push(await generarPeriodo(cliente_id, p, { alumno_id, cfg }));
  }
  return resultados;
};

const ESTADOS = ['pendiente', 'en_revision', 'pagada'];

/** Agrega a cada cuota su recargo y total si se pagara hoy (sólo las impagas). */
const conCostoHoy = (cuotas, cfg, fecha = hoy()) => cuotas.map((c) => {
  const importe = Number(c.importe);
  if (c.estado === 'pagada') return { ...c, importe, recargo_pct: 0, total_hoy: importe };
  const pct = R.recargoPct(c, fecha, cfg);
  return {
    ...c, importe, recargo_pct: pct, total_hoy: R.round2(importe + (importe * pct) / 100), vencida: fecha > c.vence,
  };
});

const listar = async (cliente_id, q = {}, alcance = {}) => {
  const f = {};
  if (q.periodo) {
    f.periodo = normalizarPeriodo(q.periodo);
    if (!f.periodo) throw new EduError('Período inválido (AAAA-MM)', { field: 'periodo' });
  }
  if (q.estado) {
    if (!ESTADOS.includes(q.estado)) throw new EduError('Estado inválido', { field: 'estado' });
    f.estado = q.estado;
  }
  if (q.alumno_id) {
    const n = Number(q.alumno_id);
    if (!Number.isInteger(n) || n <= 0) throw new EduError('alumno_id inválido', { field: 'alumno_id' });
    f.alumno_id = n;
  }
  const [cuotas, cfg] = await Promise.all([db.listarCuotas(cliente_id, f, alcance), configDe(cliente_id)]);
  return conCostoHoy(cuotas, cfg);
};

module.exports = { configDe, armarCuota, generarPeriodo, generarParaAlta, listar, conCostoHoy, ESTADOS };
