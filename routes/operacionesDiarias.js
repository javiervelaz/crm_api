const express = require('express');

const router = express.Router();
const operacionesDiariasController = require('../controllers/operacionesDiariasController');
const pedidosController = require("../controllers/pedidoController");
const { authenticateJWT, authorizeRole } = require('../middleware/authMiddleware');
const { authorizeModule } = require('../middleware/moduleAuth');
const { authorizePermission } = require("../middleware/permissionMiddleware");
const { requireLimit } = require('../middleware/limitMiddleware');

router.post('/abrir-caja', authenticateJWT, operacionesDiariasController.registrarAperturaCierreCaja);
router.post('/crear-pedido', authenticateJWT, requireLimit('maxPedidosMensuales'), operacionesDiariasController.crearPedido);
router.post('/crear-pedido-whatsaap', authenticateJWT, requireLimit('maxPedidosMensuales'), operacionesDiariasController.crearPedido);
router.get('/listar-pedidos/:registroDiarioId/:cliente_id', authenticateJWT, authorizeModule('operaciones'),
                authorizePermission('operaciones', 'operaciones.list'), operacionesDiariasController.listarPedidos);
router.post('/registrar-salida-caja', authenticateJWT, operacionesDiariasController.registrarSalidaCaja);
router.get('/consultar-inventario-insumos/:sucursalId', authenticateJWT, operacionesDiariasController.consultarInventarioInsumos);
router.post('/registrar-movimiento-inventario', authenticateJWT, operacionesDiariasController.registrarMovimientoInventario);
router.post('/registrar-compra-insumo', authenticateJWT, operacionesDiariasController.registrarCompraInsumo);
router.put('/actualizar-inventario-insumos/:id', authenticateJWT, operacionesDiariasController.actualizarInventarioInsumos);
router.post('/check-caja', authenticateJWT, operacionesDiariasController.checkCajaAbierta);
router.put('/terminar-pedido/:id', authenticateJWT, operacionesDiariasController.terminarPedido);
router.get('/detalle-pedido/:id', authenticateJWT, pedidosController.getDetallePedido);
router.get('/pedido-monto-total/:registro_diario_id/:cliente_id', authenticateJWT, operacionesDiariasController.pedidoMontoTotalDiario);
router.put('/cierre-caja', authenticateJWT, operacionesDiariasController.cierrCaja);
router.get('/registros-diarios/:filtro/:cliente_id', authenticateJWT, operacionesDiariasController.reporteOperacionesDiarias);
router.get('/registros-diarios/:id/detalle/:cliente_id', authenticateJWT, operacionesDiariasController.reporteOperacionesDiariasDetalle);
router.get('/caja-inicial/:registro_diario_id/:cliente_id', authenticateJWT, operacionesDiariasController.getCajaInicial);
router.delete('/borrar-pedido/:id/:cliente_id', authenticateJWT, authorizeModule('operaciones'),
                authorizePermission('operaciones', 'operaciones.delete'),
                pedidosController.deletePedido);

module.exports = router;