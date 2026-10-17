// services/edu/pagosService.js — pagos de cuotas.
//
// - Admin: el pago entra aprobado y el recargo se calcula con la fecha de pago.
// - Alumno/tutor: sube el comprobante → pago pendiente, cuotas en revisión.
//   El admin lo aprueba (confirmando la fecha, sobre la que se calcula el
//   recargo) o lo rechaza con motivo; al rechazar las cuotas vuelven a pendiente.
const db = require('../../model/edu/cuotas');
const storage = require('../storage');
const { EduError, hoy, esFecha } = require('./reglas');
const R = require('./cuotasReglas');
const cuotasService = require('./cuotasService');

const MAX_COMPROBANTE = 5 * 1024 * 1024;
const MAX_CUOTAS_POR_PAGO = 24;

const noEncontrado = (m = 'Pago no encontrado') => new EduError(m, { status: 404, code: 'PAGO_NO_ENCONTRADO' });

const idsDe = (v) => {
  let arr = v;
  if (typeof v === 'string') {
    try { arr = JSON.parse(v); } catch { arr = v.split(',').map((x) => x.trim()).filter(Boolean); }
  }
  if (!Array.isArray(arr) || !arr.length) throw new EduError('Elegí al menos una cuota', { field: 'cuota_ids' });
  const ids = [...new Set(arr.map(Number))];
  if (ids.some((n) => !Number.isInteger(n) || n <= 0)) throw new EduError('cuota_ids inválido', { field: 'cuota_ids' });
  if (ids.length > MAX_CUOTAS_POR_PAGO) {
    throw new EduError(`Un pago admite hasta ${MAX_CUOTAS_POR_PAGO} cuotas`, { field: 'cuota_ids' });
  }
  return ids;
};

const fechaDe = (v, { requerida = false, ahora = hoy() } = {}) => {
  if (v === undefined || v === null || v === '') {
    if (requerida) throw new EduError('La fecha de pago es obligatoria', { field: 'fecha_pago' });
    return ahora;
  }
  if (!esFecha(v)) throw new EduError('Fecha de pago inválida (AAAA-MM-DD)', { field: 'fecha_pago' });
  if (v > ahora) throw new EduError('La fecha de pago no puede ser futura', { field: 'fecha_pago' });
  return v;
};

const textoOpcional = (v, max, field) => {
  if (v === undefined || v === null || String(v).trim() === '') return null;
  const t = String(v).trim();
  if (t.length > max) throw new EduError(`Máximo ${max} caracteres`, { field });
  return t;
};

/** Cuotas del pedido, bloqueadas, todas del tenant/alcance y todas pagables. */
const cuotasPagables = async (cliente_id, ids, alcance = {}) => {
  const cuotas = await db.cuotasPorIds(cliente_id, ids, alcance, true);
  if (cuotas.length !== ids.length) {
    throw new EduError('Alguna cuota no existe', { status: 404, code: 'CUOTA_NO_ENCONTRADA', field: 'cuota_ids' });
  }
  const no = cuotas.filter((c) => c.estado !== 'pendiente');
  if (no.length) {
    throw new EduError(
      no.some((c) => c.estado === 'en_revision') ? 'Una cuota ya tiene un pago en revisión' : 'Una cuota ya está paga',
      { status: 409, code: 'CUOTA_NO_PAGABLE', field: 'cuota_ids', detalle: { cuotas: no.map((c) => ({ id: c.id, estado: c.estado })) } },
    );
  }
  return cuotas;
};

// ─── Admin: pago aprobado directo ─────────────────────────────────────────
const registrarAdmin = async (cliente_id, usuario, body = {}) => {
  const ids = idsDe(body.cuota_ids);
  const fecha_pago = fechaDe(body.fecha_pago);
  const medio_pago = textoOpcional(body.medio_pago, 40, 'medio_pago');
  const observacion = textoOpcional(body.observacion, 300, 'observacion');

  const cuotas = await cuotasPagables(cliente_id, ids);
  const cfg = await cuotasService.configDe(cliente_id);
  const { lineas, total } = R.calcularLineas(cuotas, fecha_pago, cfg);

  const { id } = await db.insertarPago(cliente_id, {
    origen: 'admin', estado: 'aprobado', pagador_user_id: usuario.userId, fecha_pago, importe_total: total,
    medio_pago, observacion, revisado_por: usuario.userId,
  });
  await db.insertarLineas(cliente_id, id, lineas);
  await db.setEstadoCuotas(cliente_id, ids, 'pagada');
  return db.getPago(cliente_id, id);
};

// ─── Alumno / tutor: comprobante, pendiente ───────────────────────────────
const crearPortal = async (cliente_id, usuario, alcance, body = {}, archivo = null) => {
  if (!['TUT', 'ALU'].includes(usuario.tipo)) {
    throw new EduError('Sólo alumnos y tutores pueden informar pagos', { status: 403, code: 'ROL_SIN_ACCESO' });
  }
  const ids = idsDe(body.cuota_ids);
  const ahora = hoy();
  const fecha_pago = fechaDe(body.fecha_pago, { ahora });
  const observacion = textoOpcional(body.observacion, 300, 'observacion');

  if (!archivo?.buffer?.length) throw new EduError('Subí el comprobante de pago', { field: 'comprobante', code: 'COMPROBANTE_REQUERIDO' });
  if (archivo.buffer.length > MAX_COMPROBANTE) {
    throw new EduError('El comprobante pesa más de 5 MB', { field: 'comprobante', code: 'COMPROBANTE_GRANDE' });
  }
  const mime = R.detectarTipo(archivo.buffer);
  if (!mime) {
    throw new EduError('Formato no permitido: subí un JPG, PNG, WEBP o PDF', { field: 'comprobante', code: 'COMPROBANTE_INVALIDO' });
  }

  const cuotas = await cuotasPagables(cliente_id, ids, alcance);
  const subido = await storage.subir({ buffer: archivo.buffer, folder: `edu/comprobantes/${cliente_id}` });
  try {
    const { id } = await db.insertarPago(cliente_id, {
      origen: 'portal',
      estado: 'pendiente',
      pagador_user_id: usuario.userId,
      fecha_pago,
      observacion,
      fuera_de_termino: R.fueraDeTermino(cuotas, ahora),
      comprobante: {
        provider: subido.provider,
        key: subido.key,
        meta: subido.meta,
        nombre: String(archivo.originalname || 'comprobante').slice(0, 200),
        mime,
      },
    });
    await db.insertarLineas(cliente_id, id, cuotas.map((c) => ({ cuota_id: c.id, importe: R.round2(c.importe) })));
    await db.setEstadoCuotas(cliente_id, ids, 'en_revision');
    return await db.getPago(cliente_id, id);
  } catch (err) {
    await storage.borrar(subido); // no dejar un archivo huérfano si la base falló
    throw err;
  }
};

// ─── Admin: revisión ──────────────────────────────────────────────────────
const pagoPendiente = async (cliente_id, id) => {
  const pago = await db.getPago(cliente_id, id, null, true);
  if (!pago) throw noEncontrado();
  if (pago.estado !== 'pendiente') {
    throw new EduError(`El pago ya fue ${pago.estado === 'aprobado' ? 'aprobado' : 'rechazado'}`, { status: 409, code: 'PAGO_YA_REVISADO' });
  }
  return pago;
};

const aprobar = async (cliente_id, id, usuario, body = {}) => {
  const fecha_pago = fechaDe(body.fecha_pago, { requerida: true });
  const medio_pago = textoOpcional(body.medio_pago, 40, 'medio_pago');
  const observacion = textoOpcional(body.observacion, 300, 'observacion');
  await pagoPendiente(cliente_id, id);

  const cuotas = await db.cuotasDePago(cliente_id, id);
  const cfg = await cuotasService.configDe(cliente_id);
  const { lineas, total } = R.calcularLineas(cuotas, fecha_pago, cfg);
  for (const l of lineas) await db.actualizarLinea(cliente_id, id, l); // eslint-disable-line no-await-in-loop
  await db.aprobarPago(cliente_id, id, {
    fecha_pago, importe_total: total, revisado_por: usuario.userId, medio_pago, observacion,
  });
  await db.setEstadoCuotas(cliente_id, cuotas.map((c) => c.id), 'pagada');
  return db.getPago(cliente_id, id);
};

const rechazar = async (cliente_id, id, usuario, body = {}) => {
  const motivo = String(body.motivo ?? '').trim();
  if (motivo.length < 3) throw new EduError('Indicá el motivo del rechazo', { field: 'motivo', code: 'MOTIVO_REQUERIDO' });
  if (motivo.length > 500) throw new EduError('El motivo admite hasta 500 caracteres', { field: 'motivo' });
  await pagoPendiente(cliente_id, id);

  const cuotas = await db.cuotasDePago(cliente_id, id);
  await db.rechazarPago(cliente_id, id, { motivo, revisado_por: usuario.userId });
  await db.setEstadoCuotas(cliente_id, cuotas.map((c) => c.id), 'pendiente');
  return db.getPago(cliente_id, id);
};

// ─── Vista previa del cálculo (no escribe) ────────────────────────────────
/**
 * Cuánto sería el pago a una fecha: la UI lo usa antes de registrar o aprobar
 * para mostrar el recargo sin duplicar las reglas. Acepta `cuota_ids` (cuotas
 * impagas) o `pago_id` (las cuotas de un pago pendiente).
 */
const calcular = async (cliente_id, body = {}) => {
  const fecha_pago = fechaDe(body.fecha_pago);
  let cuotas;
  if (body.pago_id !== undefined && body.pago_id !== null && body.pago_id !== '') {
    const pid = Number(body.pago_id);
    if (!Number.isInteger(pid) || pid <= 0) throw new EduError('pago_id inválido', { field: 'pago_id' });
    if (!(await db.getPago(cliente_id, pid))) throw noEncontrado();
    cuotas = await db.cuotasDePago(cliente_id, pid, false);
  } else {
    const ids = idsDe(body.cuota_ids);
    cuotas = await db.cuotasPorIds(cliente_id, ids, {}, false);
    if (cuotas.length !== ids.length) {
      throw new EduError('Alguna cuota no existe', { status: 404, code: 'CUOTA_NO_ENCONTRADA', field: 'cuota_ids' });
    }
    if (cuotas.some((c) => c.estado === 'pagada')) {
      throw new EduError('Una cuota ya está paga', { status: 409, code: 'CUOTA_NO_PAGABLE', field: 'cuota_ids' });
    }
  }
  const cfg = await cuotasService.configDe(cliente_id);
  const { lineas, total } = R.calcularLineas(cuotas, fecha_pago, cfg);
  const porId = new Map(cuotas.map((c) => [c.id, c]));
  return {
    fecha_pago,
    total,
    lineas: lineas.map((l) => ({ ...l, periodo: porId.get(l.cuota_id).periodo, vence: porId.get(l.cuota_id).vence })),
  };
};

// ─── Consultas ────────────────────────────────────────────────────────────
const ESTADOS_PAGO = ['pendiente', 'aprobado', 'rechazado'];

const listar = async (cliente_id, q = {}, pagador_user_id = null) => {
  if (q.estado && !ESTADOS_PAGO.includes(q.estado)) throw new EduError('Estado inválido', { field: 'estado' });
  return db.listarPagos(cliente_id, { estado: q.estado }, pagador_user_id);
};

const get = async (cliente_id, id, pagador_user_id = null) => {
  const pago = await db.getPago(cliente_id, id, pagador_user_id);
  if (!pago) throw noEncontrado();
  return pago;
};

/** URL temporal del comprobante (staff: cualquiera del tenant; portal: sólo los propios). */
const comprobante = async (cliente_id, id, pagador_user_id = null) => {
  const c = await db.getComprobante(cliente_id, id, pagador_user_id);
  if (!c) throw new EduError('Comprobante no encontrado', { status: 404, code: 'COMPROBANTE_NO_ENCONTRADO' });
  return { ...storage.urlFirmada(c), nombre: c.nombre, mime: c.mime };
};

const resumen = async (cliente_id) => ({ pendientes_revision: await db.contarPendientes(cliente_id) });

module.exports = {
  registrarAdmin, crearPortal, aprobar, rechazar, calcular, listar, get, comprobante, resumen,
  MAX_COMPROBANTE,
};
