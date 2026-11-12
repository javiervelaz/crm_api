// scripts/reporteActivacion.js
//
// Activación por origen: altas, cuántas cargaron al menos un pedido y cuántas llegaron
// a N pedidos dentro de los primeros D días. Es la consulta semanal del lanzamiento.
//
//   npm run reporte:activacion
//   npm run reporte:activacion -- --dias=14 --min=5 --desde=60 --maduros
//
//   --dias     ventana de activación desde el alta        (default 14)
//   --min      pedidos para contar como "activo"          (default 5)
//   --desde    altas de los últimos N días                (default 60)
//   --maduros  solo altas con la ventana ya cumplida (comparable entre cohortes)
//
// Solo lectura. Usa POSTGRES_URL (cargá el .env o exportalo).
require('dotenv').config();
const pool = require('../pool');

const arg = (nombre, defecto) => {
  const hit = process.argv.find((a) => a.startsWith(`--${nombre}=`));
  const n = hit ? Number(hit.split('=')[1]) : defecto;
  return Number.isInteger(n) && n > 0 ? n : defecto;
};

const SQL = (maduros) => `
  SELECT COALESCE(c.utm_source, '(directo)')  AS source,
         COALESCE(c.utm_campaign, '-')        AS campaign,
         COALESCE(c.utm_content, '-')         AS content,
         count(*)::int                        AS altas,
         count(*) FILTER (WHERE n.pedidos >= 1)::int  AS con_pedido,
         count(*) FILTER (WHERE n.pedidos >= $2)::int AS activos
    FROM cliente c
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS pedidos
        FROM pedido p
       WHERE p.cliente_id = c.id
         AND p.created_at < c.created_at + make_interval(days => $1)
    ) n ON true
   WHERE c.created_at >= now() - make_interval(days => $3)
     ${maduros ? 'AND c.created_at <= now() - make_interval(days => $1)' : ''}
   GROUP BY 1, 2, 3
   ORDER BY altas DESC, source, campaign, content`;

(async () => {
  const dias = arg('dias', 14);
  const min = arg('min', 5);
  const desde = arg('desde', 60);
  const maduros = process.argv.includes('--maduros');
  try {
    const { rows } = await pool.queryDirecta(SQL(maduros), [dias, min, desde]);
    console.log(`Activación: pedidos en los primeros ${dias} días, activo = ${min}+ pedidos; altas de los últimos ${desde} días${maduros ? ' (solo ventana cumplida)' : ''}`);
    if (!rows.length) return console.log('Sin altas en el período.');
    console.table(rows.map((r) => ({ ...r, '% con pedido': `${Math.round((r.con_pedido / r.altas) * 100)}%`, '% activos': `${Math.round((r.activos / r.altas) * 100)}%` })));
    const t = rows.reduce((a, r) => ({ altas: a.altas + r.altas, con: a.con + r.con_pedido, act: a.act + r.activos }), { altas: 0, con: 0, act: 0 });
    console.log(`Total: ${t.altas} altas, ${t.con} con pedido, ${t.act} activos.`);
  } catch (err) {
    console.error('reporteActivacion falló:', err.message);
    process.exitCode = 1;
  } finally {
    process.exit();
  }
})();
