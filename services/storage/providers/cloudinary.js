// services/storage/providers/cloudinary.js
//
// Proveedor Cloudinary del módulo de storage. Igual que las imágenes de
// productos (upload_stream desde la API), pero con entrega privada: los
// archivos se suben con type "authenticated" y sólo se leen con URLs firmadas
// que vencen.
const cloudinary = require('../../../config/cloudinary');

const NOMBRE = 'cloudinary';

/** Sube un buffer. Devuelve { key, meta, bytes }: lo que hay que guardar para leerlo o borrarlo después. */
const upload = ({ buffer, folder, filename }) => new Promise((resolve, reject) => {
  const stream = cloudinary.uploader.upload_stream(
    {
      folder,
      public_id: filename,
      // PDF e imágenes viajan como "image" (Cloudinary entrega el PDF con format=pdf)
      resource_type: 'image',
      type: 'authenticated',
      overwrite: false,
    },
    (error, result) => {
      if (error) return reject(error);
      return resolve({
        key: result.public_id,
        bytes: result.bytes,
        meta: { resource_type: result.resource_type, type: result.type, format: result.format },
      });
    },
  );
  stream.end(buffer);
});

/** URL temporal de descarga. */
const signedUrl = ({ key, meta = {}, expiresIn }) => {
  const expiresAt = Math.floor(Date.now() / 1000) + expiresIn;
  return cloudinary.utils.private_download_url(key, meta.format, {
    resource_type: meta.resource_type || 'image',
    type: meta.type || 'authenticated',
    expires_at: expiresAt,
  });
};

const remove = async ({ key, meta = {} }) => cloudinary.uploader.destroy(key, {
  resource_type: meta.resource_type || 'image',
  type: meta.type || 'authenticated',
  invalidate: true,
});

module.exports = { nombre: NOMBRE, upload, signedUrl, remove };
