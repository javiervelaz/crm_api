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
      // req.clienteId lo setea scopeTenant a partir del JWT — la ruta no
      // declara :cliente_id, así que esta es la única fuente confiable.
      const TipoProducto = await TipoProductoService.getTipoProductoByIdService(id, req.clienteId);
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
      // Antes se descartaba cliente_id acá y update tiraba siempre
      // 'cliente_id requerido' en db.js. req.clienteId ya viene validado
      // contra el JWT por scopeTenant.
      const result = await TipoProductoService.updateTipoProductoService(Id, { nombre, cliente_id: req.clienteId });
      res.status(200).json(result);
    } catch (error) {
      res.status(error.status ?? 500).json({ error: error.message });
    }
  };

  const deleteTipoProducto = async (req, res) => {
    const { id } = req.params;
    try {
      // Antes no se pasaba cliente_id acá y delete tiraba siempre.
      const result = await TipoProductoService.deleteTipoProductoService(id, req.clienteId);
      res.status(200).json(result);
    } catch (err) {
      res.status(err.status ?? 500).json({ error: err.message });
    }
  };

module.exports = {
    createTipoProducto,
    getTipoProductoById,
    getTipoProductoList,
    updateTipoProducto,
    deleteTipoProducto
  };
  