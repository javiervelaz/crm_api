const express = require('express');

const router = express.Router();
const { registerTenantGuards } = require('../middleware/tenantMiddleware');
registerTenantGuards(router);
const operacionesDiariasController = require('../controllers/operacionesDiariasController');
const pedidosController = require("../controllers/pedidoController");
const { authenticateJWT, authorizeRole } = require('../middleware/authMiddleware');
const { authorizeModule } = require('../middleware/moduleAuth');
const { authorizePermission } = require("../middleware/permissionMiddleware");
const { requireLimit } = require('../middleware/limitMiddleware');
const { requierePermiso } = require('../middleware/acceso');

// Pedidos y caja del día. Cada ruta pide el permiso de la pantalla que la usa:
// las que comparten Pedidos y Cierre de caja aceptan cualquiera de los dos.
const PEDIDOS_VER = requierePermiso('operaciones.list', 'cerrarcaja.list');
const CAJA_HISTORIAL = requierePermiso('reportes.list', 'cerrarcaja.list', 'gasto.list', 'flujo.list');

router.post('/abrir-caja', authenticateJWT, requierePermiso('operaciones.create', 'cerrarcaja.create'), operacionesDiariasController.registrarAperturaCierreCaja);
router.post('/crear-pedido', authenticateJWT, requierePermiso('operaciones.create'), requireLimit('maxPedidosMensuales'), operacionesDiariasController.crearPedido);
router.post('/crear-pedido-whatsaap', authenticateJWT, requierePermiso('operaciones.create'), requireLimit('maxPedidosMensuales'), operacionesDiariasController.crearPedido);
router.get('/listar-pedidos/:registroDiarioId/:cliente_id', authenticateJWT, authorizeModule('operaciones'),
                authorizePermission('operaciones', 'operaciones.list'), operacionesDiariasController.listarPedidos);
router.post('/registrar-salida-caja', authenticateJWT, requierePermiso('gasto.create'), operacionesDiariasController.registrarSalidaCaja);
// ¿Hay caja abierta? Lo consultan Pedidos, Gastos e Inventario: sólo staff (los externos ya los frena cuentaGuards).
router.post('/check-caja', authenticateJWT, operacionesDiariasController.checkCajaAbierta);
router.put('/terminar-pedido/:id', authenticateJWT, requierePermiso('operaciones.update'), operacionesDiariasController.terminarPedido);
router.get('/detalle-pedido/:id', authenticateJWT, PEDIDOS_VER, pedidosController.getDetallePedido);
router.get('/pedido-monto-total/:registro_diario_id/:cliente_id', authenticateJWT, PEDIDOS_VER, operacionesDiariasController.pedidoMontoTotalDiario);
router.put('/cierre-caja', authenticateJWT, requierePermiso('cerrarcaja.create'), operacionesDiariasController.cierrCaja);
router.get('/registros-diarios/:filtro/:cliente_id', authenticateJWT, CAJA_HISTORIAL, operacionesDiariasController.reporteOperacionesDiarias);
router.get('/registros-diarios/:id/detalle/:cliente_id', authenticateJWT, CAJA_HISTORIAL, operacionesDiariasController.reporteOperacionesDiariasDetalle);
router.get('/caja-inicial/:registro_diario_id/:cliente_id', authenticateJWT, PEDIDOS_VER, operacionesDiariasController.getCajaInicial);
router.delete('/borrar-pedido/:id/:cliente_id', authenticateJWT, authorizeModule('operaciones'),
                authorizePermission('operaciones', 'operaciones.delete'),
                pedidosController.deletePedido);

module.exports = router;