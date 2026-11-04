// services/harness/curador/reporte.js — insumo del agente curador de intents (nivel 1).
//
// Convierte turn_log en un reporte para decidir qué intents nuevos vale la pena
// escribir. NO propone SQL ni código: eso lo hace el agente, con revisión humana.
// Todo lo que sale de acá es DATO no confiable: el texto lo escribieron usuarios
// de los comercios y puede traer instrucciones dirigidas a un modelo. Quien lo lea
// (el agente) lo trata como cita, nunca como orden.

const curadorDb = require('../../../model/harness/curador');
const { router } = require('../core/router');
const { normalizar } = require('../core/normalizar');

const DIAS_MAX = 90;
/** Por debajo de esto no hay muestra para proponer intents: se reporta y se espera. */
const MIN_TURNOS = 50;
const MIN_COMERCIOS = 3;
const TEXTO_MAX = 160;

/** Saca lo que identifica a una persona: mails, teléfonos y cualquier número largo. */
const anonimizar = (texto) => String(texto ?? '')
  .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[mail]')
  .replace(/\+?\d[\d\s().-]{5,}\d/g, '[numero]')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, TEXTO_MAX);

const acotarDias = (dias) => {
  const n = Number(dias);
  if (!Number.isInteger(n) || n < 1) return 7;
  return Math.min(n, DIAS_MAX);
};

/**
 * @param {{ dias?: number }} opts
 * @param {{ db?: object }} deps  (tests)
 */
const construirReporte = async ({ dias } = {}, deps = {}) => {
  const db = deps.db || curadorDb;
  const d = acotarDias(dias);
  const [crudos, resumen] = await Promise.all([db.noEntendidos({ dias: d }), db.resumen({ dias: d })]);

  // Preguntas que antes no se entendían y hoy el router sí resuelve: se agregó el
  // patrón después. No son candidatas a intent nuevo; son señal de que ya está cubierto.
  const grupos = new Map();
  for (const f of crudos) {
    const clave = normalizar(anonimizar(f.texto));
    if (!clave) continue;
    const g = grupos.get(clave) || { texto: anonimizar(f.texto), veces: 0, comercios: 0, ultima: f.ultima, ya_cubierto: router(f.texto) !== null };
    g.veces += f.veces;
    g.comercios = Math.max(g.comercios, f.comercios); // cota inferior: no se pueden sumar distintos entre grupos
    if (f.ultima > g.ultima) g.ultima = f.ultima;
    grupos.set(clave, g);
  }
  const preguntas = [...grupos.values()]
    .sort((a, b) => b.comercios - a.comercios || b.veces - a.veces)
    .map((g) => ({ ...g, ultima: new Date(g.ultima).toISOString() }));

  const total = resumen.reduce((s, r) => s + r.turnos, 0);
  const comercios = resumen.reduce((m, r) => Math.max(m, r.comercios), 0);
  const noEntendidos = resumen.filter((r) => r.intent === 'no_entendido').reduce((s, r) => s + r.turnos, 0);
  const negados = resumen.filter((r) => String(r.stage).startsWith('negado_'));
  const fallidos = resumen.filter((r) => r.fallidos > 0);

  return {
    ventana_dias: d,
    generado: new Date().toISOString(),
    muestra_suficiente: total >= MIN_TURNOS && comercios >= MIN_COMERCIOS,
    umbrales: { min_turnos: MIN_TURNOS, min_comercios: MIN_COMERCIOS },
    totales: {
      turnos: total,
      comercios_max_por_grupo: comercios, // cota inferior de comercios activos
      no_entendidos: noEntendidos,
      tasa_no_entendido: total ? Number((noEntendidos / total).toFixed(3)) : 0,
      turnos_con_modelo: resumen.reduce((s, r) => s + r.con_modelo, 0),
    },
    preguntas_no_entendidas: preguntas,
    senales: {
      negaciones_por_autorizacion: negados.map(({ stage, intent, turnos, comercios: c }) => ({ stage, intent, turnos, comercios: c })),
      turnos_fallidos: fallidos.map(({ stage, intent, fallidos: f, turnos }) => ({ stage, intent, fallidos: f, turnos })),
      latencia: resumen.filter((r) => r.latencia_ms_max > 3000).map(({ stage, intent, latencia_ms_prom, latencia_ms_max }) => ({ stage, intent, latencia_ms_prom, latencia_ms_max })),
    },
    por_intent: resumen.map(({ stage, intent, turnos, comercios: c }) => ({ stage, intent, turnos, comercios: c })),
  };
};

module.exports = { construirReporte, anonimizar, MIN_TURNOS, MIN_COMERCIOS };
