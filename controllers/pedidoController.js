const PedidoService = require('../services/pedido/pedidoService');


const createPedido = async (req, res) => {
  const { registro_diario_id, monto_total,usuario_id,sucursal_id,productos  } = req.body;

  try {
    // Crear el pedido y los productos asociados
    const newPedidoId = await PedidoService.createPedidoService({
      registro_diario_id,
      monto_total,
      usuario_id,
      sucursal_id,
      medio_pago_id,
      productos,
      observacion
    });

    res.status(201).json({ pedido_id: newPedidoId, message: 'Pedido creado exitosamente' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const getPedidoById = async (req, res) => {
    const { id } = req.params;
    try {
      const Pedido = await PedidoService.getPedidoService({ id });
        if (!Pedido) {
          return res.status(404).json({ error: 'Pedido not found' });
        }
        res.status(200).json(Pedido);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  };

  const getDetallePedido = async (req, res) => {
    const { id,cliente_id } = req.params;
    try {
      const Pedido = await PedidoService.getDetallePedido( id,cliente_id );
        if (!Pedido) {
          return res.status(404).json({ error: 'Pedido88 not found' });
        }
        res.status(200).json(Pedido);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  };

  const getPedidoList = async (req, res) => {
    try {
      const result = await PedidoService.getPedidoListService()
      res.status(200).json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };
  
  const updatePedido = async (req, res) => {
    const id = req.params.id;
    const { registro_diario_id, precio_total,usuario_id,sucursal_id } = req.body;
    try {
      const updatedPedido = await PedidoService.updatePedidoService(id, {registro_diario_id, precio_total,usuario_id,sucursal_id});
      res.status(200).json(updatedPedido);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  };
  
  const deletePedido = async (req, res) => {
    const { id,cliente_id } = req.params;
    try {
      const result = await PedidoService.deletePedidoService(id,cliente_id);
      res.status(200).json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };

module.exports = {
    createPedido,
    getPedidoById,
    getPedidoList,
    updatePedido,
    deletePedido,
    getDetallePedido
  };
  