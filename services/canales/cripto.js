// services/canales/cripto.js
//
// Credenciales de canales (token de bot de Telegram, y en W2 el de WhatsApp)
// encriptadas con AES-256-GCM. Clave: CANAL_ENC_KEY, 32 bytes en hex (64 chars):
//   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
// Formato guardado: v1.<iv b64>.<tag b64>.<cipher b64>
const crypto = require('crypto');

const clave = () => {
  const hex = process.env.CANAL_ENC_KEY || '';
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    const err = new Error('CANAL_ENC_KEY no configurada (64 caracteres hex)');
    err.status = 503;
    err.code = 'CANAL_NO_CONFIGURADO';
    throw err;
  }
  return Buffer.from(hex, 'hex');
};

const encriptar = (texto) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', clave(), iv);
  const enc = Buffer.concat([cipher.update(String(texto), 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), enc.toString('base64')].join('.');
};

const desencriptar = (guardado) => {
  const [v, iv, tag, enc] = String(guardado || '').split('.');
  if (v !== 'v1' || !iv || !tag || !enc) throw new Error('Credencial con formato inválido');
  const decipher = crypto.createDecipheriv('aes-256-gcm', clave(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(enc, 'base64')), decipher.final()]).toString('utf8');
};

const sha256 = (texto) => crypto.createHash('sha256').update(String(texto)).digest('hex');

/** Compara un valor recibido contra un hash sha256 guardado, en tiempo constante. */
const coincideHash = (recibido, hashGuardado) => {
  if (!recibido || !hashGuardado) return false;
  const a = Buffer.from(sha256(recibido), 'hex');
  const b = Buffer.from(String(hashGuardado), 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

const secretoAleatorio = (bytes = 32) => crypto.randomBytes(bytes).toString('hex');

module.exports = { encriptar, desencriptar, sha256, coincideHash, secretoAleatorio };
