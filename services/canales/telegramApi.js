// services/canales/telegramApi.js — cliente mínimo de la Bot API.
// TELEGRAM_API_BASE sólo para tests/E2E (default https://api.telegram.org).

const base = () => (process.env.TELEGRAM_API_BASE || 'https://api.telegram.org').replace(/\/+$/, '');

const telegramError = (status, message, code = 'TELEGRAM_ERROR') => {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
};

/** Llama a un método de la Bot API. El token nunca va a logs ni a errores. */
const llamar = async (token, metodo, payload = {}) => {
  if (!token) throw telegramError(500, 'Sin token de bot');
  let res;
  try {
    res = await fetch(`${base()}/bot${token}/${metodo}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(Number(process.env.TELEGRAM_TIMEOUT_MS || 8000)),
    });
  } catch {
    throw telegramError(502, 'No se pudo conectar con Telegram');
  }
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  if (!res.ok || !data || data.ok !== true) {
    if (res.status === 401 || res.status === 404) {
      throw telegramError(400, 'El token del bot no es válido', 'TELEGRAM_TOKEN_INVALIDO');
    }
    throw telegramError(502, data?.description || `Telegram respondió ${res.status}`);
  }
  return data.result;
};

const getMe = (token) => llamar(token, 'getMe');

const setWebhook = (token, { url, secretToken }) => llamar(token, 'setWebhook', {
  url,
  secret_token: secretToken,
  allowed_updates: ['message'],
  drop_pending_updates: true,
});

const deleteWebhook = (token) => llamar(token, 'deleteWebhook', { drop_pending_updates: true });

const sendMessage = (token, chatId, text, extra = {}) =>
  llamar(token, 'sendMessage', { chat_id: chatId, text, ...extra });

module.exports = { llamar, getMe, setWebhook, deleteWebhook, sendMessage };
