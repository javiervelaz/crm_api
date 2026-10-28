const pool = require('../../pool');

const CAMPOS_NUMERICOS = ['caja_inicial', 'caja_final', 'ventas_efectivo', 'ventas_digital', 'retiros_total', 'gatos_total', 'diferencias_caja'];

/** numeric -> number (null se queda null). `gastos_total` es el nombre que usa el front para `gatos_total`. */
const normalizarRegistro = (registro) => {
  const out = { ...registro };
  for (const c of CAMPOS_NUMERICOS) out[c] = registro[c] === null || registro[c] === undefined ? null : Number(registro[c]);
  out.gastos_total = out.gatos_total;
  return out;
};
const { hoySql } = require('../../utils/fechaTenant');

// La fecha de la caja la pone el servidor en la zona del tenant. Antes venía del
// navegador como new Date() → ISO en UTC → una caja abierta a las 22:00 quedaba
// con la fecha de mañana.
const createRegistroDiario  = async (RegistroDiario) => {
    const { usuario_apertura_id, usuario_cierre_id, caja_inicial,caja_final,sucursal_id, cliente_id } = RegistroDiario;
    const result = await pool.query(
      `INSERT INTO "registro_diario" (fecha, usuario_apertura_id, usuario_cierre_id, caja_inicial,caja_final,sucursal_id,cliente_id)
       VALUES (${hoySql('$6')}, $1, $2, $3, $4, $5, $6) RETURNING *`,
      [usuario_apertura_id, usuario_cierre_id, caja_inicial,caja_final,sucursal_id,cliente_id]
    );
    return result.rows[0];
  };
  
  const getRegistroDiarioById = async (id) => {
    const result = await pool.query('SELECT * FROM "registro_diario" WHERE id = $1', [id]);
    return result;
  };
  
  const getCajasAbiertasByCliente = async(cliente_id) => {
    const result = await pool.query('select * from "registro_diario" where cliente_id =$1 and caja_cerrada  is NULL ',[cliente_id]);
    return result.rows;
  }

  const cerrarTodasLasCajasAbiertasByCliente = async (cliente_id) => {
    await pool.query(
      `
      UPDATE "registro_diario"
      SET caja_cerrada = TRUE,
          updated_at = NOW()
      WHERE cliente_id = $1
        AND caja_cerrada IS NULL
      `,
      [cliente_id],
    );
  };

  const getRegistrosDiarios = async (filtroParam,cliente_id) => {
    try {
      const filtro = filtroParam || 'dia';
   
      let query = `
        SELECT * FROM registro_diario
      `;
      
      switch (filtro) {
        case 'dia':
          query += `WHERE fecha = ${hoySql('$1')} and cliente_id =  $1 ORDER BY fecha DESC`;
          break;
        case 'semana':
          query += `WHERE fecha >= ${hoySql('$1')} - 7 and cliente_id =  $1 ORDER BY fecha DESC`;
          break;
        case 'mes':
          query += `WHERE fecha >= ${hoySql('$1')} - 30 and cliente_id =  $1 ORDER BY fecha DESC`;
          break;
        default:
          query += 'ORDER BY fecha DESC LIMIT 30';
      }
     
      const result = await pool.query(query,[cliente_id]);
      return result.rows;
      
    } catch (error) {
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }
  }

  
  const getRegistrosDiariosDetalle = async (id,cliente_id) => {
    try {
      const registroQuery = 'SELECT * FROM registro_diario WHERE id = $1 and cliente_id =  $2';
      const registroResult = await pool.query(registroQuery, [id,cliente_id]);
      
      if (registroResult.rows.length === 0) {
        // CORRECCIÓN: Devuelve un objeto con error, no una tupla
        return { error: 'Registro no encontrado', status: 404 };
      }
      
      const registro = registroResult.rows[0];
      
      // Obtener entradas (pedidos)
      const entradasQuery = `
        SELECT p.id, p.monto_total, mp.descripcion as medio_pago, p.created_at
        FROM pedido p
        INNER JOIN medio_pago mp ON p.medio_pago_id = mp.id
        WHERE p.registro_diario_id = $1
        ORDER BY p.created_at
      `;
      const entradasResult = await pool.query(entradasQuery, [id]);
      
      // Obtener salidas
      const salidasQuery = `
        SELECT sc.id, sc.descripcion, sc.monto, ct.descripcion as categoria, sc.created_at
        FROM salida_caja sc
        INNER JOIN categoria_tipo ct ON sc.categoria_salida_id = ct.id
        WHERE sc.registro_diario_id = $1
        ORDER BY sc.created_at
      `;
      const salidasResult = await pool.query(salidasQuery, [id]);
      
      // Calcular totales
      const totalEntradas = entradasResult.rows.reduce((sum, row) => sum + parseFloat(row.monto_total), 0);
      const totalSalidas = salidasResult.rows.reduce((sum, row) => sum + parseFloat(row.monto), 0);
      // pg devuelve numeric como string: "1000.00" + 5000 concatenaba en vez de sumar.
      const registroNum = normalizarRegistro(registro);
      const saldoFinal = Math.round((registroNum.caja_inicial + totalEntradas - totalSalidas) * 100) / 100;
      
      console.log("Registro encontrado:", {
        totalEntradas,
        totalSalidas,
        saldoFinal,
        cajaInicial: registroNum.caja_inicial
      });
      
      return {
        registro: registroNum,
        entradas: entradasResult.rows,
        salidas: salidasResult.rows,
        total_entradas: totalEntradas,
        total_salidas: totalSalidas,
        saldo_final: saldoFinal
      };
      
    } catch (error) {
      console.error('Error en getRegistrosDiariosDetalle:', error);
      return { error: 'Error interno del servidor', status: 500 };
    }
  }
  
  const updateRegistroDiario  = async (id, user) => {
    const {fecha, usuario_apertura_id, usuario_cierre_id, caja_inicial,caja_final,sucursal_id } = user;
    const result = await pool.query(
      'UPDATE "registro_diario" SET fecha = $1, usuario_apertura_id = $2, usuario_cierre_id = $3, caja_inicial = $4,caja_final =$5, sucursal_id=$6, updated_at = CURRENT_TIMESTAMP WHERE id = $7 RETURNING *',
      [fecha, usuario_apertura_id, usuario_cierre_id, caja_inicial,caja_final,sucursal_id, id]
    );
    return result.rows[0];
  };
  
  const deleteRegistroDiario  = async (id) => {
    const result = await pool.query('DELETE FROM "registro_diario" WHERE id = $1 RETURNING *', [id]);
    return result.rows[0];
  };

  /**
   * Cierra la caja y deja asentado lo que el servidor sabe, sin confiar en el cliente:
   * ventas en efectivo / digitales (pedidos terminados, por medio de pago), total de
   * salidas de caja y, si el cajero contó el efectivo, la diferencia.
   *
   *   esperado en efectivo = caja_inicial + ventas_efectivo + otros_ingresos
   *                          - salidas de caja - gastos_administrativos
   *   diferencias_caja     = efectivo_contado - esperado        (NULL si no se contó)
   *
   * Las ventas digitales (débito, crédito, transferencia) no entran al cajón.
   * `caja_final` sigue siendo el valor que calcula el front (no cambia su significado).
   * Nota de esquema: la columna se llama `gatos_total` (typo histórico).
   */
  const updateMontoFinalRegistroDiario  = async (id, monto_final, usuario_cierre_id, sucursal_id, cliente_id, extras = {}) => {
    const { efectivo_contado = null, otros_ingresos = 0, gastos_administrativos = 0 } = extras;
    const result = await pool.query(
      `WITH v AS (
         SELECT COALESCE(SUM(p.monto_total) FILTER (WHERE mp.codigo = 'EFE'), 0) AS efectivo,
                COALESCE(SUM(p.monto_total) FILTER (WHERE mp.codigo IS DISTINCT FROM 'EFE'), 0) AS digital
           FROM pedido p
           JOIN medio_pago mp ON mp.id = p.medio_pago_id
          WHERE p.registro_diario_id = $1 AND p.cliente_id = $5 AND p.pedido_terminado = true
       ), g AS (
         SELECT COALESCE(SUM(s.monto), 0) AS total
           FROM salida_caja s
          WHERE s.registro_diario_id = $1 AND s.cliente_id = $5
       )
       UPDATE registro_diario rd
          SET caja_final = $2, usuario_cierre_id = $3, sucursal_id = $4,
              updated_at = CURRENT_TIMESTAMP, caja_cerrada = TRUE,
              ventas_efectivo = v.efectivo, ventas_digital = v.digital, gatos_total = g.total,
              diferencias_caja = CASE WHEN $6::numeric IS NULL THEN NULL
                ELSE $6::numeric - (rd.caja_inicial + v.efectivo + $7::numeric - g.total - $8::numeric) END
         FROM v, g
        WHERE rd.id = $1 AND rd.cliente_id = $5
        RETURNING rd.*`,
      [id, monto_final, usuario_cierre_id, sucursal_id, cliente_id, efectivo_contado, otros_ingresos, gastos_administrativos]
    );
    return result;
  };

  const getCajaInicial = async(registro_diario_id,cliente_id) => {
    const result = await pool.query('SELECT sum("caja_inicial") FROM registro_diario where "id"= $1 and "cliente_id" =  $2 '
      ,[registro_diario_id,cliente_id]);
      return result.rows[0];
  }
  
  
  module.exports = {
    createRegistroDiario,
    getRegistroDiarioById,
    getRegistrosDiarios,
    updateRegistroDiario,
    deleteRegistroDiario,
    getCajasAbiertasByCliente,
    updateMontoFinalRegistroDiario,
    getCajaInicial,
    getRegistrosDiariosDetalle,
    cerrarTodasLasCajasAbiertasByCliente
    };