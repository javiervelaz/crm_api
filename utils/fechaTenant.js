// utils/fechaTenant.js
//
// "Hoy", "este mes" y "qué día fue" en la zona horaria DEL TENANT (cliente.timezone).
//
// Cómo se guardan las fechas: la sesión de Neon corre en GMT y las columnas
// created_at de pedido, salida_caja, compra_insumo, etc. son `timestamp` SIN zona
// con default CURRENT_TIMESTAMP → guardan la hora UTC. Por eso:
//   · CURRENT_DATE / DATE(created_at) son el día UTC: desde las 21:00 en Argentina
//     ya es "mañana" y las ventas de la noche caen en el día siguiente.
//   · Para llevar un created_at a la hora local: col AT TIME ZONE 'UTC' AT TIME ZONE tz.
//
// Los fragmentos SQL reciben el placeholder del cliente_id (p. ej. '$1') y
// resuelven la zona con una subconsulta: no hace falta pasar la zona desde JS ni
// otra ida a la base.

const TZ_DEFAULT = 'America/Argentina/Cordoba';

const tzSql = (clienteParam) => `(SELECT timezone FROM cliente WHERE id = ${clienteParam})`;

/** Fecha de hoy en la zona del tenant (date). */
const hoySql = (clienteParam) => `(now() AT TIME ZONE ${tzSql(clienteParam)})::date`;

/** Un `timestamp` sin zona guardado en UTC, llevado a la hora local del tenant. */
const localSql = (col, clienteParam) => `(${col} AT TIME ZONE 'UTC' AT TIME ZONE ${tzSql(clienteParam)})`;

/** Día local (date) de un `timestamp` sin zona guardado en UTC. */
const fechaLocalSql = (col, clienteParam) => `${localSql(col, clienteParam)}::date`;

/**
 * Inicio del mes local del tenant, expresado como `timestamp` UTC sin zona:
 * se compara directo con created_at (y así puede usar índices sobre created_at).
 */
const inicioMesUtcSql = (clienteParam) => {
  const tz = tzSql(clienteParam);
  return `((date_trunc('month', now() AT TIME ZONE ${tz}) AT TIME ZONE ${tz}) AT TIME ZONE 'UTC')`;
};

/** 'YYYY-MM-DD' de hoy en una zona (lado JS). */
const hoyEn = (tz = TZ_DEFAULT, ahora = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ahora);

/** ¿Es una zona IANA válida? (la misma base que usa Postgres) */
const esTimezoneValida = (tz) => {
  if (typeof tz !== 'string' || !tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

module.exports = {
  TZ_DEFAULT,
  tzSql,
  hoySql,
  localSql,
  fechaLocalSql,
  inicioMesUtcSql,
  hoyEn,
  esTimezoneValida,
};
