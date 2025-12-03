const ProductoService = require('../services/producto/productoService');
const productoImgService = require('../services/producto/productoImgService');


const createProducto = async (req, res) => {
  const {  nombre,precio_unitario,tipo_producto_id, permite_mitad, cliente_id } = req.body;

  try {
    const result = await ProductoService.createProductoService({  nombre,precio_unitario,tipo_producto_id ,permite_mitad,cliente_id});
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const getProductoById = async (req, res) => {
    const { id, cliente_id } = req.params;
    try {
      const Producto = await ProductoService.getProductoByIdService( id,cliente_id );
        if (!Producto) {
          return res.status(404).json({ error: 'Producto not found' });
        }
        res.status(200).json(Producto);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  };

  const getProductoList = async (req, res) => {
    const {  cliente_id } = req.params;
    if(!cliente_id) return res.status(404).json( { error: "No se puede filtrar por cliente"});
    try {
      const result = await ProductoService.getProductoListService(cliente_id)
      res.status(200).json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };
  
  const updateProducto = async (req, res) => {
    const Id = req.params.id;
    const {  nombre,precio_unitario,tipo_producto_id, permite_mitad,cliente_id } = req.body;
    try {
      const result = await ProductoService.updateProductoService(Id, { nombre,precio_unitario,tipo_producto_id,permite_mitad,cliente_id});
      res.status(200).json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  };
  
  const deleteProducto = async (req, res) => {
    const { id,cliente_id } = req.params;
    try {
      const result = await ProductoService.deleteProductoService(id,cliente_id);
      res.status(200).json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };



const uploadImage = async (req, res, next) => {
  try {
    const { id } = req.params; // id de producto
    if (!req.file) {
      return res.status(400).json({ message: 'No se recibió archivo' });
    }

    const result = await productoImgService.uploadImage({
      productoId: Number(id),
      fileBuffer: req.file.buffer,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
    });

    return res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};

const listImages = async (req, res, next) => {
  try {
    const { id } = req.params;
    const images = await productoImgService.listImages(Number(id));
    return res.json(images);
  } catch (error) {
    next(error);
  }
};

const deleteImage = async (req, res, next) => {
  try {
    const { imgId } = req.params;
    await productoImgService.deleteImage(Number(imgId));
    return res.status(204).send();
  } catch (error) {
    next(error);
  }
};


module.exports = {
    createProducto,
    getProductoById,
    getProductoList,
    updateProducto,
    deleteProducto,
    uploadImage,
    listImages,
    deleteImage
  };
  