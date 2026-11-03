// model/harness/curador.js — lecturas de turn_log para el agente curador de intents.
//
// SOLO LECTURA y AGREGADA, a propósito cross-tenant: el curador busca lo que se
// repite entre comercios. Por eso NO devuelve cliente_id, user_id ni
// external_user_id: sólo cuántos comercios distintos hicieron la pregunta.
// (Es la única consulta del harness sin WHERE cliente_id; se llama únicamente
// desde /api/platform, protegido por PLATFORM_ADMIN_TOKEN.)
const pool = require('../../pool');

/** Preguntas que el router no resolvió, agrupadas por texto exacto (case-insensitive). */
const noEntendidos = async ({ dias, vertical = 'interno', limite = 500 }) => {
  const r = await pool.query(
    `SELECT lower(btrim(texto))            AS texto,
            count(*)::int                  AS veces,
            count(DISTINCT cliente_id)::int AS comercios,
            min(created_at)                AS primera,
            max(created_at)                AS ultima
       FROM turn_log
      WHERE vertical = $1
        AND intent = 'no_entendido' AND stage = 'router'
        AND texto IS NOT NULL AND btrim(texto) <> ''
        AND created_at >= now() - make_interval(days => $2::int)
      GROUP BY 1
      ORDER BY comercios DESC, veces DESC, ultima DESC
      LIMIT $3::int`,
    [vertical, dias, limite]
  );
  return r.rows;
};

/** Salud del harness: volumen por stage/intent y señales de fallo, sin texto de usuarios. */
const resumen = async ({ dias, vertical = 'interno' }) => {
  const r = await pool.query(
    `SELECT stage, intent,
            count(*)::int                                AS turnos,
            count(DISTINCT cliente_id)::int              AS comercios,
            count(*) FILTER (WHERE NOT ok)::int          AS fallidos,
            count(*) FILTER (WHERE model IS NOT NULL)::int AS con_modelo,
            COALESCE(round(avg(latency_ms)))::int        AS latencia_ms_prom,
            COALESCE(max(latency_ms), 0)::int            AS latencia_ms_max
       FROM turn_log
      WHERE vertical = $1 AND created_at >= now() - make_interval(days => $2::int)
      GROUP BY stage, intent
      ORDER BY turnos DESC`,
    [vertical, dias]
  );
  return r.rows;
};

module.exports = { noEntendidos, resumen };
