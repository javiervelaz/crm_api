// services/micrositio/micrositioService.js
//
// Lógica del micrositio de pedidos por WhatsApp. El tenant, el teléfono y la
// conversación salen del token de handoff; sucursal y usuario los resuelve el
// servidor desde la caja abierta. El total lo calcula el servidor con los
// precios de la DB: el browser del cliente final no decide precios.
const db = require('../../model/micrositio/db');
const productoService = require('../producto/productoService');
const operacionesDiariasService = require('../operaciones_diarias/operacionesDiariasService');

const MAX_ITEMS = 50;
const MAX_CANTIDAD = 99;

const badRequest = (message, code = 'VALIDATION') => {
  const err = new Error(message);
  err.status = 400;
  err.code = code;
  return err;
};

const texto = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const entero = (v) => (Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : null);
const redondear = (n) => Math.round(n * 100) / 100;

const mapProducto = (p) => ({
  id: p.id,
  nombre: p.nombre,
  precio_unitario: Number(p.precio_unitario),
  tipo_producto: p.tipo_producto ?? null,
  tipo_producto_id: p.tipo_producto_id ?? null,
  permite_mitad: Boolean(p.permite_mitad),
  imagen_url: p.imagen_url ?? null,
});

const listarProductos = async (clienteId) =>
  (await productoService.getProductoListService(clienteId)).map(mapProducto);

const obtenerProducto = async (clienteId, id) => {
  const p = await productoService.getProductoByIdService(id, clienteId);
  return p ? mapProducto(p) : null;
};

const listarMediosPago = () => db.getMediosPago();

const estadoCaja = async (clienteId) => {
  const caja = await db.getCajaAbierta(clienteId);
  return { caja_abierta: Boolean(caja), fecha: caja ? caja.fecha : null };
};

/**
 * Body: { nombre, tipo_entrega: 'delivery'|'pickup', direccion?, observaciones?,
 *         medio_pago_id, paga_efectivo?, items: [{ producto_id, cantidad, observaciones? }] }
 */
const crearPedido = async (clienteId, handoff, body = {}) => {
  const nombre = texto(body.nombre, 100);
  if (!nombre) throw badRequest('Ingresá tu nombre');

  const tipoEntrega = body.tipo_entrega === 'delivery' ? 'delivery' : body.tipo_entrega === 'pickup' ? 'pickup' : null;
  if (!tipoEntrega) throw badRequest('Elegí delivery o retiro en el local');

  const direccion = texto(body.direccion, 200);
  if (tipoEntrega === 'delivery' && !direccion) throw badRequest('Ingresá la dirección de entrega');
  const observaciones = texto(body.observaciones, 500);

  // Items
  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) throw badRequest('El carrito está vacío');
  if (items.length > MAX_ITEMS) throw badRequest(`Máximo ${MAX_ITEMS} productos por pedido`);
  const normalizados = items.map((it) => {
    const producto_id = entero(it?.producto_id);
    const cantidad = entero(it?.cantidad);
    if (!producto_id || !cantidad || cantidad > MAX_CANTIDAD) throw badRequest('Producto o cantidad inválidos');
    return { producto_id, cantidad, observaciones: texto(it.observaciones, 200) };
  });

  // Precios desde la DB, sólo productos del tenant
  const ids = [...new Set(normalizados.map((i) => i.producto_id))];
  const productos = await db.getProductosPorIds(clienteId, ids);
  const precioPorId = new Map(productos.map((p) => [Number(p.id), Number(p.precio_unitario)]));
  if (!ids.every((id) => precioPorId.has(id))) throw badRequest('Algún producto ya no está disponible', 'PRODUCTO_INVALIDO');

  const lineas = normalizados.map((i) => ({
    producto_id: i.producto_id,
    cantidad: i.cantidad,
    cantidad_mitad: 0,
    precio_unitario: precioPorId.get(i.producto_id),
    observaciones: i.observaciones,
    monto_adicional: 0,
  }));
  const total = redondear(lineas.reduce((acc, l) => acc + l.precio_unitario * l.cantidad, 0));

  // Medio de pago
  const medioPagoId = entero(body.medio_pago_id);
  const medios = await db.getMediosPago();
  const medio = medios.find((m) => Number(m.id) === medioPagoId);
  if (!medio) throw badRequest('Elegí un medio de pago');

  let pagaEfectivo = 0;
  let vuelto = 0;
  if (String(medio.codigo).toUpperCase() === 'EFE' && body.paga_efectivo != null && body.paga_efectivo !== '') {
    pagaEfectivo = Number(body.paga_efectivo);
    if (!Number.isFinite(pagaEfectivo) || pagaEfectivo < total) {
      throw badRequest(`El monto con el que pagás tiene que ser al menos $${total}`);
    }
    vuelto = redondear(pagaEfectivo - total);
  }

  // Caja abierta → sucursal y usuario del pedido
  const caja = await db.getCajaAbierta(clienteId);
  if (!caja) {
    const err = new Error('El comercio no está tomando pedidos en este momento');
    err.status = 409;
    err.code = 'CAJA_CERRADA';
    throw err;
  }

  const idPedido = await operacionesDiariasService.crearPedido({
    registro_diario_id: caja.id,
    usuario_id: caja.usuario_apertura_id,
    sucursal_id: caja.sucursal_id,
    monto_total: total,
    medio_pago_id: medio.id,
    cliente_nombre: nombre,
    cliente_telefono: handoff.userPhoneE164,
    cliente_casa_nro: tipoEntrega === 'delivery' ? direccion : '',
    cliente_barrio: '',
    pedido_obs: [tipoEntrega === 'delivery' ? 'Delivery' : 'Retiro en local', 'WhatsApp', observaciones]
      .filter(Boolean).join(' - '),
    productos: lineas,
    user_cliente_id: null,
    paga_efectivo: pagaEfectivo,
    vuelto_pago_efectivo: vuelto,
    monto_adicional: 0,
    cliente_id: clienteId,
    conversation_id: handoff.conversationId ?? null,
  });

  return { idPedido, total, vuelto };
};

module.exports = { listarProductos, obtenerProducto, listarMediosPago, estadoCaja, crearPedido };
