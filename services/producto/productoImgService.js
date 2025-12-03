const cloudinary = require('../../config/cloudinary');
const ProductoImgDb = require('../../model/producto_img/db');

function buildImageUrl(publicId) {
  // Podés tunear transforms acá si querés (width, quality, etc)
  return cloudinary.url(publicId, { secure: true });
}

exports.uploadImage = async ({ productoId, fileBuffer, originalName, mimeType }) => {
  if (!productoId) {
    throw new Error('productoId es requerido');
  }

  // 1) Subir a Cloudinary
  const uploadResult = await new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: `productos/${productoId}`,
        resource_type: 'image',
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      },
    );
    stream.end(fileBuffer);
  });

  const publicId = uploadResult.public_id; // lo guardamos en "nombre"

  // 2) Guardar en DB
  const imgRecord = await ProductoImgDb.insert({
    producto_id: productoId,
    nombre: publicId,
    descripcion: originalName || '',
  });

  return {
    id: imgRecord.id,
    producto_id: productoId,
    nombre: imgRecord.nombre,
    descripcion: imgRecord.descripcion,
    url: buildImageUrl(publicId),
  };
};

exports.listImages = async (productoId) => {
  const rows = await ProductoImgDb.findByProductoId(productoId);
  return rows.map((row) => ({
    id: row.id,
    producto_id: row.producto_id,
    nombre: row.nombre,
    descripcion: row.descripcion,
    url: buildImageUrl(row.nombre),
  }));
};

exports.deleteImage = async (id) => {
  const img = await ProductoImgDb.findById(id);
  if (!img) return;

  // Borrar de Cloudinary
  await cloudinary.uploader.destroy(img.nombre);

  // Borrar de DB
  await ProductoImgDb.delete(id);
};
