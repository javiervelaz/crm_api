// model/edu/catalogo.js — tipos de clase, clases y precios. Siempre por cliente_id.
const pool = require('../../pool');

const D = (col) => `to_char(${col}, 'YYYY-MM-DD')`;

// ─── Módulo ─────────────────────────────────────────────────────────────────
const tenantTieneModulo = async (cliente_id, codigo) => {
  const { rows } = await pool.query(
    `SELECT EXISTS (
       SELECT 1 FROM modulo
        WHERE cliente_id = $1 AND codigo = $2 AND status = true AND deleted_at IS NULL
     ) AS ok`,
    [cliente_id, codigo]
  );
  return rows[0].ok === true;
};

// ─── Tipos de clase ─────────────────────────────────────────────────────────
const listarTipos = async (cliente_id) => (await pool.query(
  `SELECT id, nombre, es_grupal, activo FROM edu_tipo_clase WHERE cliente_id = $1 ORDER BY id`,
  [cliente_id]
)).rows;

const getTipo = async (cliente_id, id) => (await pool.query(
  `SELECT id, nombre, es_grupal, activo FROM edu_tipo_clase WHERE cliente_id = $1 AND id = $2`,
  [cliente_id, id]
)).rows[0] || null;

const tipoPorNombre = async (cliente_id, nombre, excluirId = null) => (await pool.query(
  `SELECT id FROM edu_tipo_clase
    WHERE cliente_id = $1 AND lower(nombre) = lower($2) AND ($3::int IS NULL OR id <> $3)`,
  [cliente_id, nombre, excluirId]
)).rows[0] || null;

const crearTipo = async (cliente_id, { nombre, es_grupal }) => (await pool.query(
  `INSERT INTO edu_tipo_clase (cliente_id, nombre, es_grupal) VALUES ($1, $2, $3)
   RETURNING id, nombre, es_grupal, activo`,
  [cliente_id, nombre, es_grupal]
)).rows[0];

const actualizarTipo = async (cliente_id, id, { nombre, es_grupal, activo }) => (await pool.query(
  `UPDATE edu_tipo_clase
      SET nombre = COALESCE($3, nombre), es_grupal = COALESCE($4, es_grupal), activo = COALESCE($5, activo)
    WHERE cliente_id = $1 AND id = $2
   RETURNING id, nombre, es_grupal, activo`,
  [cliente_id, id, nombre, es_grupal, activo]
)).rows[0] || null;

const tipoEnUso = async (cliente_id, id) => (await pool.query(
  `SELECT EXISTS (SELECT 1 FROM edu_clase WHERE cliente_id = $1 AND tipo_clase_id = $2) AS en_uso`,
  [cliente_id, id]
)).rows[0].en_uso;

// ─── Clases ─────────────────────────────────────────────────────────────────
// precio_vigente: el del período pedido (o el mes actual).
const SELECT_CLASE = `
  SELECT c.id, c.nombre, c.cupo, c.activa, c.tipo_clase_id,
         t.nombre AS tipo_clase, t.es_grupal,
         pv.importe_mensual AS precio_vigente, pv.importe_clase AS precio_clase_vigente,
         ${D('pv.vigente_desde')} AS precio_vigente_desde,
         (SELECT count(*)::int FROM edu_inscripcion i
           WHERE i.clase_id = c.id AND i.cliente_id = c.cliente_id
             AND (i.fecha_baja IS NULL OR i.fecha_baja >= $2::date)) AS inscripciones_activas
    FROM edu_clase c
    JOIN edu_tipo_clase t ON t.id = c.tipo_clase_id
    LEFT JOIN LATERAL (
      SELECT p.importe_mensual, p.importe_clase, p.vigente_desde
        FROM edu_clase_precio p
       WHERE p.clase_id = c.id AND p.vigente_desde <= date_trunc('month', $2::date)
       ORDER BY p.vigente_desde DESC
       LIMIT 1
    ) pv ON true`;

const listarClases = async (cliente_id, { hoy, soloActivas }) => (await pool.query(
  `${SELECT_CLASE}
    WHERE c.cliente_id = $1 AND ($3::boolean IS NOT TRUE OR c.activa)
    ORDER BY c.nombre, t.nombre`,
  [cliente_id, hoy, soloActivas === true]
)).rows;

const getClase = async (cliente_id, id, hoy) => (await pool.query(
  `${SELECT_CLASE} WHERE c.cliente_id = $1 AND c.id = $3`,
  [cliente_id, hoy, id]
)).rows[0] || null;

const clasePorNombre = async (cliente_id, nombre, tipo_clase_id, excluirId = null) => (await pool.query(
  `SELECT id FROM edu_clase
    WHERE cliente_id = $1 AND lower(nombre) = lower($2) AND tipo_clase_id = $3 AND ($4::int IS NULL OR id <> $4)`,
  [cliente_id, nombre, tipo_clase_id, excluirId]
)).rows[0] || null;

const crearClase = async (cliente_id, { nombre, tipo_clase_id, cupo }) => (await pool.query(
  `INSERT INTO edu_clase (cliente_id, nombre, tipo_clase_id, cupo) VALUES ($1, $2, $3, $4) RETURNING id`,
  [cliente_id, nombre, tipo_clase_id, cupo]
)).rows[0];

const actualizarClase = async (cliente_id, id, { nombre, tipo_clase_id, cupo, activa }) => (await pool.query(
  `UPDATE edu_clase
      SET nombre = $3, tipo_clase_id = $4, cupo = $5, activa = $6, updated_at = CURRENT_TIMESTAMP
    WHERE cliente_id = $1 AND id = $2
   RETURNING id`,
  [cliente_id, id, nombre, tipo_clase_id, cupo, activa]
)).rows[0] || null;

// ─── Precios ────────────────────────────────────────────────────────────────
const SELECT_PRECIO = `SELECT id, clase_id, ${D('vigente_desde')} AS vigente_desde, importe_mensual, importe_clase
                         FROM edu_clase_precio`;

const listarPrecios = async (cliente_id, clase_id) => (await pool.query(
  `${SELECT_PRECIO} WHERE cliente_id = $1 AND clase_id = $2 ORDER BY vigente_desde DESC`,
  [cliente_id, clase_id]
)).rows;

const getPrecio = async (cliente_id, clase_id, id) => (await pool.query(
  `${SELECT_PRECIO} WHERE cliente_id = $1 AND clase_id = $2 AND id = $3`,
  [cliente_id, clase_id, id]
)).rows[0] || null;

const precioDelMes = async (cliente_id, clase_id, vigente_desde) => (await pool.query(
  `SELECT id FROM edu_clase_precio WHERE cliente_id = $1 AND clase_id = $2 AND vigente_desde = $3`,
  [cliente_id, clase_id, vigente_desde]
)).rows[0] || null;

const crearPrecio = async (cliente_id, clase_id, { vigente_desde, importe_mensual, importe_clase }) => (await pool.query(
  `INSERT INTO edu_clase_precio (cliente_id, clase_id, vigente_desde, importe_mensual, importe_clase)
   VALUES ($1, $2, $3, $4, $5)
   RETURNING id, clase_id, ${D('vigente_desde')} AS vigente_desde, importe_mensual, importe_clase`,
  [cliente_id, clase_id, vigente_desde, importe_mensual, importe_clase]
)).rows[0];

const actualizarPrecio = async (cliente_id, clase_id, id, { importe_mensual, importe_clase }) => (await pool.query(
  `UPDATE edu_clase_precio SET importe_mensual = $4, importe_clase = $5
    WHERE cliente_id = $1 AND clase_id = $2 AND id = $3
   RETURNING id, clase_id, ${D('vigente_desde')} AS vigente_desde, importe_mensual, importe_clase`,
  [cliente_id, clase_id, id, importe_mensual, importe_clase]
)).rows[0] || null;

const borrarPrecio = async (cliente_id, clase_id, id) => (await pool.query(
  `DELETE FROM edu_clase_precio WHERE cliente_id = $1 AND clase_id = $2 AND id = $3 RETURNING id`,
  [cliente_id, clase_id, id]
)).rows[0] || null;

module.exports = {
  tenantTieneModulo,
  listarTipos, getTipo, tipoPorNombre, crearTipo, actualizarTipo, tipoEnUso,
  listarClases, getClase, clasePorNombre, crearClase, actualizarClase,
  listarPrecios, getPrecio, precioDelMes, crearPrecio, actualizarPrecio, borrarPrecio,
};
