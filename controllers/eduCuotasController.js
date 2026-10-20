// controllers/eduCuotasController.js — cuotas y pagos de /api/edu. El tenant sale siempre del JWT.
const cuotas = require('../services/edu/cuotasService');
const pagos = require('../services/edu/pagosService');
const cron = require('../services/edu/cuotasCron');
const { EduError, normalizarPeriodo } = require('../services/edu/reglas');
const { StorageError } = require('../services/storage');

const responderError = (res, next, err) => {
  if (err instanceof EduError || err instanceof StorageError) {
    return res.status(err.status).json({
      error: err.message, code: err.code, field: err.field, ...(err.detalle ? { detalle: err.detalle } : {}),
    });
  }
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'El comprobante pesa más de 5 MB', code: 'COMPROBANTE_GRANDE', field: 'comprobante' });
  }
  if (err?.name === 'MulterError') {
    return res.status(400).json({ error: 'Archivo inválido', code: 'COMPROBANTE_INVALIDO', field: 'comprobante' });
  }
  return next(err);
};

const h = (fn, status = 200) => async (req, res, next) => {
  try {
    res.status(status).json(await fn(req));
  } catch (err) {
    responderError(res, next, err);
  }
};

const cid = (req) => req.clienteId;
const pagoId = (req) => {
  const n = Number(req.params.id);
  if (!Number.isInteger(n) || n <= 0) throw new EduError('id inválido', { code: 'INVALID_PARAM' });
  return n;
};
const staff = (req) => ({ userId: req.user.userId, tipo: req.user.tipo });

// ─── Administración ───────────────────────────────────────────────────────
const listarCuotas = h((req) => cuotas.listar(cid(req), req.query));
const generarCuotas = h((req) => cuotas.generarPeriodo(cid(req), req.body?.periodo ?? req.query.periodo));
const listarPagos = h((req) => pagos.listar(cid(req), req.query));
const resumenPagos = h((req) => pagos.resumen(cid(req)));
const getPago = h((req) => pagos.get(cid(req), pagoId(req)));
const comprobante = h((req) => pagos.comprobante(cid(req), pagoId(req)));
const calcularPago = h((req) => pagos.calcular(cid(req), req.body));
const registrarPago = h((req) => pagos.registrarAdmin(cid(req), staff(req), req.body), 201);
const aprobarPago = h((req) => pagos.aprobar(cid(req), pagoId(req), staff(req), req.body));
const rechazarPago = h((req) => pagos.rechazar(cid(req), pagoId(req), staff(req), req.body));

// ─── Vista propia (alumno / tutor) ────────────────────────────────────────
const misCuotas = h((req) => cuotas.listar(cid(req), req.query, req.eduAlcance));
const misPagos = h((req) => pagos.listar(cid(req), req.query, req.user.userId));
const miComprobante = h((req) => pagos.comprobante(cid(req), pagoId(req), req.user.userId));
const crearMiPago = h((req) => pagos.crearPortal(cid(req), staff(req), req.eduAlcance, req.body, req.file), 201);

// ─── Cron (n8n) ───────────────────────────────────────────────────────────
const periodoCron = (v) => {
  if (v === undefined || v === null || v === '') return undefined; // mes actual
  const p = normalizarPeriodo(v);
  if (!p) throw new EduError('Período inválido (AAAA-MM)', { field: 'periodo' });
  return p;
};
const cronGenerar = h((req) => cron.generarTodas(periodoCron(req.body?.periodo)));
const cronPendientes = h(() => cron.pendientesDeAviso());
const cronAvisados = h((req) => cron.marcarAvisados(req.body?.ids));
const cronAvisar = h(() => cron.avisarPendientes());

module.exports = {
  responderError,
  listarCuotas, generarCuotas, listarPagos, resumenPagos, getPago, comprobante, calcularPago, registrarPago, aprobarPago, rechazarPago,
  misCuotas, misPagos, miComprobante, crearMiPago,
  cronGenerar, cronPendientes, cronAvisados, cronAvisar,
};
