// services/harness/core/usage.js — telemetría del turno (turn_log).
//
// Reglas (invariantes 9, 10 y 11 del harness):
//  · Una fila por turno, siempre: también los que no tocaron un modelo y los que
//    fallaron. registrarTurno NUNCA lanza: la telemetría no puede tirar el turno.
//  · El turno vale entero: lo que costó clasificar se suma a lo que costó
//    ejecutar (acumular() suma los usos parciales antes de registrar).
//  · `gasto` lo marca el ejecutor; no se infiere de los tokens.
const turnLog = require('../../../model/harness/turnLog');

const VERTICALES = new Set(['interno', 'atencion']);
const MAX_TEXTO = 500;
const MAX_ERROR = 300;

const entero = (n) => (Number.isFinite(Number(n)) && Number(n) > 0 ? Math.round(Number(n)) : 0);
const recortar = (s, max) => (s == null ? null : String(s).slice(0, max));
const idOpcional = (n) => (Number.isInteger(Number(n)) && Number(n) > 0 ? Number(n) : null);

/** Suma usos parciales ({ input_tokens, output_tokens, ... }) en uno solo. */
const acumular = (...usos) => usos.filter(Boolean).reduce((acc, u) => ({
  input_tokens: acc.input_tokens + entero(u.input_tokens),
  output_tokens: acc.output_tokens + entero(u.output_tokens),
  cached_tokens: acc.cached_tokens + entero(u.cached_tokens),
  cache_write_tokens: acc.cache_write_tokens + entero(u.cache_write_tokens),
  model: u.model || acc.model,
}), { input_tokens: 0, output_tokens: 0, cached_tokens: 0, cache_write_tokens: 0, model: null });

/** Normaliza el turno a una fila de turn_log. Lanza si falta lo mínimo. */
const aFila = (t) => {
  const clienteId = idOpcional(t.clienteId);
  if (!clienteId) throw new Error('turn_log: cliente_id requerido');
  if (!VERTICALES.has(t.vertical)) throw new Error(`turn_log: vertical inválida (${t.vertical})`);
  if (!t.canal) throw new Error('turn_log: canal requerido');
  if (!t.stage) throw new Error('turn_log: stage requerido');
  const uso = acumular(t.uso);
  return {
    cliente_id: clienteId,
    user_id: idOpcional(t.userId),
    vertical: t.vertical,
    canal: String(t.canal).slice(0, 20),
    canal_cuenta_id: idOpcional(t.canalCuentaId),
    external_user_id: recortar(t.externalUserId, 100),
    texto: recortar(t.texto, MAX_TEXTO),
    intent: recortar(t.intent, 60),
    stage: String(t.stage).slice(0, 30),
    ok: t.ok !== false,
    gasto: t.gasto === true,
    model: uso.model,
    input_tokens: uso.input_tokens,
    output_tokens: uso.output_tokens,
    cached_tokens: uso.cached_tokens,
    cache_write_tokens: uso.cache_write_tokens,
    msgs_out: entero(t.msgsOut),
    msgs_billing: recortar(t.msgsBilling, 40),
    latency_ms: t.latencyMs == null ? null : entero(t.latencyMs),
    error: recortar(t.error, MAX_ERROR),
  };
};

/**
 * Registra un turno. Devuelve el id de la fila, o null si no se pudo
 * (se loguea por consola; el turno sigue).
 */
const registrarTurno = async (turno) => {
  try {
    return await turnLog.insertar(aFila(turno));
  } catch (err) {
    console.error('[harness] turn_log no registrado:', err.message);
    return null;
  }
};

/** Mide un turno: corre fn y devuelve { resultado, error, latencyMs }. No lanza. */
const medir = async (fn) => {
  const t0 = Date.now();
  try {
    return { resultado: await fn(), error: null, latencyMs: Date.now() - t0 };
  } catch (error) {
    return { resultado: null, error, latencyMs: Date.now() - t0 };
  }
};

module.exports = { registrarTurno, acumular, aFila, medir };
