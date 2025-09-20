const ProductoService = require('../services/producto/productoService');


const createProducto = async (req, res) => {
  const {  nombre,precio_unitario,tipo_producto_id, permite_mitad } = req.body;

  try {
    const result = await ProductoService.createProductoService({  nombre,precio_unitario,tipo_producto_id ,permite_mitad});
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const getProductoById = async (req, res) => {
    const { id } = req.params;
    try {
      const Producto = await ProductoService.getProductoByIdService( id );
        if (!Producto) {
          return res.status(404).json({ error: 'Producto not found' });
        }
        res.status(200).json(Producto);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  };

  const getProductoList = async (req, res) => {
    try {
      const result = await ProductoService.getProductoListService()
      res.status(200).json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };
  
  const updateProducto = async (req, res) => {
    const Id = req.params.id;
    const {  nombre,precio_unitario,tipo_producto_id, permite_mitad } = req.body;
    try {
      const result = await ProductoService.updateProductoService(Id, { nombre,precio_unitario,tipo_producto_id,permite_mitad});
      res.status(200).json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  };
  
  const deleteProducto = async (req, res) => {
    const { id } = req.params;
    try {
      const result = await ProductoService.deleteProductoService(id);
      res.status(200).json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };

module.exports = {
    createProducto,
    getProductoById,
    getProductoList,
    updateProducto,
    deleteProducto
  };
  