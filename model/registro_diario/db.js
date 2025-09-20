const pool = require('../../pool');

const createRegistroDiario  = async (RegistroDiario) => {
    const { fecha, usuario_apertura_id, usuario_cierre_id, caja_inicial,caja_final,sucursal_id } = RegistroDiario;
    const result = await pool.query(
      'INSERT INTO "registro_diario" (fecha, usuario_apertura_id, usuario_cierre_id, caja_inicial,caja_final,sucursal_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [fecha, usuario_apertura_id, usuario_cierre_id, caja_inicial,caja_final,sucursal_id]
    );
    return result.rows[0];
  };
  
  const getRegistroDiarioById = async (id) => {
    const result = await pool.query('SELECT * FROM "registro_diario" WHERE id = $1', [id]);
    return result;
  };
  
  const getByRegistroFechaUsuario = async(fecha) => {
    const result = await pool.query('select * from "registro_diario" where fecha = $1 and caja_cerrada  is NULL ',[fecha]);
    return result.rows;
  }

  const getRegistrosDiarios = async (filtroParam) => {
    try {
      const filtro = filtroParam || 'dia';
      console.log (filtro);
      let query = `
        SELECT * FROM registro_diario 
      `;
      
      switch (filtro) {
        case 'dia':
          query += 'WHERE fecha = CURRENT_DATE ORDER BY fecha DESC';
          break;
        case 'semana':
          query += 'WHERE fecha >= CURRENT_DATE - INTERVAL \'7 days\' ORDER BY fecha DESC';
          break;
        case 'mes':
          query += 'WHERE fecha >= CURRENT_DATE - INTERVAL \'30 days\' ORDER BY fecha DESC';
          break;
        default:
          query += 'ORDER BY fecha DESC LIMIT 30';
      }
     
      const result = await pool.query(query);
      return result.rows;
      
    } catch (error) {
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }
  }

  
  const getRegistrosDiariosDetalle = async (id) => {
    try {
      const registroQuery = 'SELECT * FROM registro_diario WHERE id = $1';
      const registroResult = await pool.query(registroQuery, [id]);
      
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
      const saldoFinal = registro.caja_inicial + totalEntradas - totalSalidas;
      
      console.log("Registro encontrado:", {
        totalEntradas,
        totalSalidas,
        saldoFinal,
        cajaInicial: registro.caja_inicial
      });
      
      return {
        registro,
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

  const updateMontoFinalRegistroDiario  = async (id,monto_final, usuario_cierre_id, sucursal_id) => {
    const result = await pool.query(
      'UPDATE "registro_diario" SET caja_final = $2, usuario_cierre_id = $3, sucursal_id = $4, updated_at = CURRENT_TIMESTAMP, caja_cerrada = TRUE WHERE id = $1 RETURNING *',
      [id,monto_final, usuario_cierre_id, sucursal_id]
    );
    return result;
  };

  const getCajaInicial = async(registro_diario_id) => {
    const result = await pool.query('SELECT sum("caja_inicial") FROM registro_diario where "id"= $1 '
      ,[registro_diario_id]);
      return result.rows[0];
  }
  
  
  module.exports = {
    createRegistroDiario,
    getRegistroDiarioById,
    getRegistrosDiarios,
    updateRegistroDiario,
    deleteRegistroDiario,
    getByRegistroFechaUsuario,
    updateMontoFinalRegistroDiario,
    getCajaInicial,
    getRegistrosDiariosDetalle
    };