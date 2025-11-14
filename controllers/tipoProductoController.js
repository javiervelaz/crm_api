const TipoProductoService = require('../services/tipo_producto/tipoProductoService');

const createTipoProducto = async (req, res) => {
  const {  nombre,cliente_id } = req.body;

  try {
    const result = await TipoProductoService.createTipoProductoService({  nombre, cliente_id });
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const getTipoProductoById = async (req, res) => {
    const { id } = req.params;
    try {
      const TipoProducto = await TipoProductoService.getTipoProductoByIdService( id );
      console.log("tipo prod",TipoProducto);
        if (!TipoProducto) {
          return res.status(404).json({ error: 'TipoProducto not found' });
        }
        res.status(200).json(TipoProducto);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  };

  const getTipoProductoList = async (req, res) => {
    const {  cliente_id } = req.params;
    if(!cliente_id) return res.status(404).json( { error: "No se puede filtrar por cliente"});
    try {
      const result = await TipoProductoService.getTipoProductoListService(cliente_id)
      res.status(200).json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };
  
  const updateTipoProducto = async (req, res) => {
    const Id = req.params.id;
    const {  nombre } = req.body;
    try {
      const result = await TipoProductoService.updateTipoProductoService(Id, { nombre});
      res.status(200).json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  };
  
  const deleteTipoProducto = async (req, res) => {
    const { id } = req.params;
    try {
      const result = await TipoProductoService.deleteTipoProductoService(id);
      res.status(200).json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };

module.exports = {
    createTipoProducto,
    getTipoProductoById,
    getTipoProductoList,
    updateTipoProducto,
    deleteTipoProducto
  };
  