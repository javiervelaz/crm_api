const pool = require('../../pool');

  
const getReporteVentasWithFilters = async (request) => {
  const { fecha_desde, fecha_hasta, productos } = request;
  
  // Usamos una consulta parametrizada con condición dinámica segura
  let query = `
    SELECT 
      DATE(p.created_at) AS fecha,
      pr.nombre AS producto,
      SUM(pp.cantidad) AS cantidad_total,
      SUM(pp.cantidad * pp.precio_unitario) AS total_vendido 
    FROM pedido p 
    JOIN pedido_producto pp ON p.id = pp.pedido_id 
    JOIN producto pr ON pr.id = pp.producto_id 
    WHERE 
      DATE(p.created_at) BETWEEN $1 AND $2
  `;

  const params = [fecha_desde, fecha_hasta];
  
  if (productos) {
    query += ` AND pp.producto_id = ANY(string_to_array($${params.length + 1}, ',')::int[])`;
    params.push(productos);
  }

  query += `
    GROUP BY DATE(p.created_at), pr.nombre 
    ORDER BY fecha ASC
  `;

  const result = await pool.query(query, params);
  return result.rows;
};


const getReporteClientesWithFilters = async (request) => {
  const { fecha_desde, fecha_hasta, tipo_cliente } = request;
  
  // Usamos una consulta parametrizada con condición dinámica segura
  let query = `
    SELECT 
       u.id as cliente_id,
      COALESCE(u.nombre || ' ' || u.apellido, 'Mostrador') as cliente_nombre,
      u.email as cliente_email,
      pf.telefono as cliente_telefono,
      COUNT(p.id) as total_pedidos,
      SUM(p.monto_total) as monto_total,
      AVG(p.monto_total) as promedio_pedido,
      MAX(p.created_at) as ultima_compra,
      STRING_AGG(DISTINCT pp.producto_id || ':' || pr.nombre, ', ') as productos_comprados
    FROM pedido p
    LEFT JOIN "user" u ON p.cliente_id = u.id
    LEFT JOIN "user_type" ut on ut.id = u.user_type_id
    left join "profile" pf on pf.id_user = u.id
    LEFT JOIN pedido_producto pp ON p.id = pp.pedido_id
    LEFT JOIN producto pr ON pp.producto_id = pr.id
    WHERE 
      DATE(p.created_at) BETWEEN $1 AND $2
  `;

  const params = [fecha_desde, fecha_hasta];
  
  if (tipo_cliente == 'MOS') {
    query += ` AND p.cliente_id IS NULL `;
    console.log("query",query);
    //params.push(tipo_cliente);
  }
  if (tipo_cliente == 'CLI') {
    query += ` AND ut.codigo = $3 `;
    params.push(tipo_cliente);
  }

  query += `
    GROUP BY u.id, u.nombre, u.apellido, u.email,pf.telefono
    ORDER BY monto_total DESC
  `;
  console.log("query",query);
  const result = await pool.query(query, params);
  return result.rows;
};

const getReporteGastosPorTipoCategoria = async (request) => {
  const { fecha_desde, fecha_hasta, tipoId } = request;
  
  // Usamos una consulta parametrizada con condición dinámica segura
  let query = `
    SELECT 
      ct.descripcion AS tipo_categoria,
      COUNT(sc.id) AS cantidad_gastos,
      SUM(sc.monto) AS total_gastos
    FROM salida_caja sc
    JOIN categoria_tipo ct ON sc.categoria_salida_id  = ct.id
    WHERE 
      DATE(sc.created_at) BETWEEN $1 AND $2
  `;

  const params = [fecha_desde, fecha_hasta];
  
  if (tipoId) {
    query += ` AND ct.id = $3`;
    params.push(tipoId);
  }

  query += `
    GROUP BY ct.id,ct.descripcion
  `;

  const result = await pool.query(query, params);
  return result.rows;
};

const getReporteGastosPorCategoriaSalida = async (request) => {
  const { fecha_desde, fecha_hasta, salida_descripcion } = request;
  
  // Usamos una consulta parametrizada con condición dinámica segura
  let query = `
    SELECT 
      sc.descripcion AS salida,
      COUNT(sc.id) AS cantidad_gastos,
      SUM(sc.monto) AS total_gastos
    FROM salida_caja sc
    WHERE 
      DATE(sc.created_at) BETWEEN $1 AND $2
  `;

  const params = [fecha_desde, fecha_hasta];
  
  if (salida_descripcion) {
    query += ` AND sc.descripcion = $3`;
    params.push(salida_descripcion);
  }

  query += `
    GROUP BY salida
  `;

  const result = await pool.query(query, params);
  return result.rows;
};

const getCategoriaSalida = async () => {
  
  
  // Usamos una consulta parametrizada con condición dinámica segura
  let query = `
    SELECT 
      cs.id AS id,
      cs.nombre AS nombre
    FROM categoria_salida cs
  `;

  const result = await pool.query(query, []);
  return result.rows;
};

const getCategoriaTipo = async () => {
  
  
  // Usamos una consulta parametrizada con condición dinámica segura
  let query = `
    SELECT 
      ct.id AS id,
      ct.descripcion AS descripcion
    FROM categoria_tipo ct
  `;

  const result = await pool.query(query, []);
  return result.rows;
};
  

  
  module.exports = {
    getReporteVentasWithFilters,
    getReporteGastosPorTipoCategoria,
    getReporteGastosPorCategoriaSalida,
    getCategoriaSalida,
    getCategoriaTipo,
    getReporteClientesWithFilters
};