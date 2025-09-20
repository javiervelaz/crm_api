const { connectors } = require('googleapis/build/src/apis/connectors');
const pool = require('../../pool');

const createPedido  = async (pedidos) => {
 
    const { registro_diario_id, monto_total,usuario_id,sucursal_id,medio_pago_id, observaciones, comanda_nro, cliente_id,paga_efectivo,vuelto_pago_efectivo } = pedidos;
    const result = await pool.query(
      'INSERT INTO "pedido" (registro_diario_id, monto_total,usuario_id,sucursal_id,medio_pago_id,observaciones, comanda_nro, cliente_id,paga_efectivo,vuelto_pago_efectivo ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8,$9,$10) RETURNING *',
      [registro_diario_id, monto_total,usuario_id,sucursal_id, medio_pago_id,observaciones,comanda_nro,cliente_id,paga_efectivo,vuelto_pago_efectivo]
    );

    return result.rows[0].id;
  };

  const insertPedidoProducto = async (pedidoId, productos) => {
    const query = 'INSERT INTO pedido_producto (pedido_id, producto_id, cantidad, precio_unitario,cantidad_mitad,observaciones,monto_adicional) VALUES ($1, $2, $3, $4,$5,$6,$7)';
    
    for (const producto of productos) {
      const { producto_id, cantidad, precio_unitario,cantidad_mitad,observaciones, monto_adicional } = producto;
      await pool.query(query, [pedidoId, producto_id, cantidad, precio_unitario,cantidad_mitad,observaciones,monto_adicional]);
    }
  };
  
  
  const getPedidoById = async (id) => {
    const result = await pool.query('SELECT * FROM "pedido" WHERE id = $1', [id]);
    return result;
  };

  const getPedidoByRegistroId = async (id) => {
    const result = await pool.query('SELECT p.id,u.nombre nombre,p.comanda_nro ,p.monto_total,p.created_at, pro.telefono FROM "pedido" p join "profile" pro on p.cliente_id = pro.id_user join "user" u on u.id= p.cliente_id WHERE p.registro_diario_id = $1 and p.pedido_terminado is NULL  union all SELECT p2.id,null nombre, p2.comanda_nro,p2.monto_total, p2.created_at,NULL FROM "pedido" p2 WHERE p2.registro_diario_id = $1 and p2.pedido_terminado is NULL and p2.cliente_id is NULL order by 5 DESC', [id]);
    return result;
  };

  const getComandaNro = async (id) => {
    const result  = await pool.query('SELECT count(*) FROM "pedido" WHERE registro_diario_id = $1 ', [id])
    return result.rows;
  }

  const getDetallePedido = async (id) => {
    const result = await pool.query('SELECT p.id,p.nombre,p.precio_unitario FROM "pedido_producto" pp inner join "producto" p on pp.producto_id = p.id WHERE pp.pedido_id = $1', [id]);
    return result.rows;
  };


  
  
  const getPedidos = async () => {
    const result = await pool.query('SELECT * FROM "pedido" ', []);
    return result;
  }
  
  
  const updatePedido  = async (id, pedidos) => {
    const { monto_total, medio_pago_id  } = pedidos;
    const result = await pool.query(
      'UPDATE "pedido" SET monto_total = $1,medio_pago_id = $2 , updated_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING *',
      [ monto_total, medio_pago_id , id]
    );
    return result.rows[0];
  };
  
  const deletePedido = async (id) => {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN'); // Iniciar transacción
  
      // 1. Eliminar productos del pedido
      await client.query('DELETE FROM "pedido_producto" WHERE pedido_id = $1', [id]);
      
      // 2. Eliminar el pedido
      const result = await client.query('DELETE FROM "pedido" WHERE id = $1 RETURNING *', [id]);
      
      await client.query('COMMIT'); // Confirmar transacción
      return result.rows[0];
      
    } catch (error) {
      await client.query('ROLLBACK'); // Revertir en caso de error
      throw error;
    } finally {
      client.release(); // Liberar conexión
    }
  };

  const terminarPedido = async (id) => {
    const result = await pool.query(
      'UPDATE "pedido" SET pedido_terminado = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *',
      [id]
    );
    return result;
  }

  const getPedidosMontoTotalDiario = async(registro_diario_id) => {
    const result = await pool.query('SELECT sum("monto_total") FROM pedido where "registro_diario_id"= $1 and "pedido_terminado"= true '
      ,[registro_diario_id]);
      return result.rows[0];
  }
  
  
  module.exports = {
    createPedido,
    getPedidoById,
    getPedidos,
    updatePedido,
    deletePedido,
    insertPedidoProducto,
    getPedidoByRegistroId,
    terminarPedido,
    getDetallePedido,
    getPedidosMontoTotalDiario,
    getComandaNro
    };