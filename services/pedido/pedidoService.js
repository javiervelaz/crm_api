const db = require('../../model/pedido/db');

const createPedidoService = async (pedido) => { 
  const { registro_diario_id, precio_total, usuario_id, sucursal_id, medio_pago_id,  productos, observaciones } = pedido;

  if (!precio_total || productos.length === 0) {
    throw new Error('Precio total y al menos un producto son requeridos');
  }
  console.log("comanda llega")
  const pedido_data = await db.getComandaNro(registro_diario_id);
  console.log("comanda ",pedido_data);
  let comanda_nro  = null;
  if (!pedido_data || pedido_data === 0) {
    comanda_nro = 1
  }else{
    comanda_nro = comanda_nro + 1;
  }
  // Crear el pedido y obtener el ID del nuevo pedido
  const pedidoId = await db.createPedido({ registro_diario_id, precio_total, usuario_id, sucursal_id, medio_pago_id, observaciones, comanda_nro });

  // Insertar los productos relacionados en la tabla intermedia
  await db.insertPedidoProducto(pedidoId, productos);

  return pedidoId;
}; 

  const getPedidoService = async (id) => {
    const result = await db.getPedidoById(id);
    return result.rows[0];
  }

  const getDetallePedido = async (id,cliente_id) => {
    const result = await db.getDetallePedido(id,cliente_id);
    return result;
  };

  const getPedidoByRegistroId = async (id) => {
    const result =  db.getPedidoByRegistroId(id)
    return result.rows;
  };

  const getPedidoListService = async () => {
    const result = await db.getPedidos();
    return result.rows;
  }

  const updatePedidoService = async (id,pedido) => {
    const {registro_diario_id, precio_total,usuario_id,sucursal_id } = pedido;
    if (!precio_total  ) {
      throw new Error('All fields are required');
    }
    
    const result = await db.updatePedido(id, { registro_diario_id, precio_total,usuario_id,sucursal_id});
    return result;
  }

  const deletePedidoService = async (id,cliente_id) => {
    const result = await db.deletePedido(id,cliente_id);
    if (!result) {
      return res.status(404).json({ error: 'Pedido not found' });
    }
    return result;
  }

  module.exports = {
    createPedidoService,
    getPedidoService,
    getPedidoListService,
    updatePedidoService,
    deletePedidoService,
    getPedidoByRegistroId,
    getDetallePedido
};