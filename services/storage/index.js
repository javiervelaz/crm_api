// services/storage/index.js
//
// Storage de archivos privados (comprobantes de pago, etc.), independiente del
// proveedor. Los consumidores guardan { provider, key, meta } y nunca importan
// el SDK del proveedor. Para migrar a S3 u otro: agregar
// services/storage/providers/<nombre>.js con { nombre, upload, signedUrl,
// remove } y poner STORAGE_PROVIDER=<nombre>. Los archivos ya subidos siguen
// resolviéndose por el `provider` que quedó guardado en cada fila.
//
// Contrato de un proveedor:
//   upload({ buffer, folder, filename })      → { key, bytes, meta }
//   signedUrl({ key, meta, expiresIn })       → string (URL temporal)
//   remove({ key, meta })                     → void
const crypto = require('crypto');

const PROVEEDORES = {
  cloudinary: () => require('./providers/cloudinary'),
};

const DEFAULT_URL_TTL = 300; // segundos

class StorageError extends Error {
  constructor(message, { status = 502, code = 'STORAGE_ERROR', cause } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    if (cause) this.cause = cause;
  }
}

const cargar = (nombre) => {
  const f = PROVEEDORES[nombre];
  if (!f) throw new StorageError(`Proveedor de storage desconocido: ${nombre}`, { status: 500, code: 'STORAGE_PROVEEDOR' });
  return f();
};

const proveedorActivo = () => process.env.STORAGE_PROVIDER || 'cloudinary';

/**
 * Sube un archivo. `folder` ya viene armado por el consumidor y debe llevar el
 * tenant (ej. "edu/comprobantes/40"). Devuelve lo que hay que guardar en la base.
 */
const subir = async ({ buffer, folder, nombre }) => {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new StorageError('Archivo vacío', { status: 400, code: 'ARCHIVO_VACIO' });
  if (!folder) throw new StorageError('folder es requerido', { status: 500, code: 'STORAGE_FOLDER' });
  const proveedor = cargar(proveedorActivo());
  try {
    const r = await proveedor.upload({ buffer, folder, filename: nombre || crypto.randomUUID() });
    return { provider: proveedor.nombre, key: r.key, meta: r.meta ?? null, bytes: r.bytes ?? buffer.length };
  } catch (err) {
    throw new StorageError('No se pudo guardar el archivo', { cause: err });
  }
};

/** URL temporal de lectura de un archivo ya guardado. */
const urlFirmada = ({ provider, key, meta }, expiresIn = DEFAULT_URL_TTL) => {
  if (!provider || !key) throw new StorageError('Archivo sin ubicación', { status: 404, code: 'ARCHIVO_NO_ENCONTRADO' });
  const url = cargar(provider).signedUrl({ key, meta: meta ?? {}, expiresIn });
  return { url, expira_en: expiresIn };
};

/** Borra un archivo. Best-effort: no tira si el proveedor falla (se loguea). */
const borrar = async ({ provider, key, meta }) => {
  if (!provider || !key) return false;
  try {
    await cargar(provider).remove({ key, meta: meta ?? {} });
    return true;
  } catch (err) {
    console.error('[storage] no se pudo borrar', provider, key, err.message);
    return false;
  }
};

module.exports = { subir, urlFirmada, borrar, StorageError, proveedorActivo, DEFAULT_URL_TTL };
