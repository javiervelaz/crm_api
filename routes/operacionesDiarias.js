const express = require('express');
const router = express.Router();
const operacionesDiariasController = require('../controllers/operacionesDiariasController');
const pedidosController = require("../controllers/pedidoController");

router.post('/abrir-caja', operacionesDiariasController.registrarAperturaCierreCaja);
router.post('/crear-pedido', operacionesDiariasController.crearPedido);
router.get('/listar-pedidos/:registroDiarioId/:cliente_id', operacionesDiariasController.listarPedidos);
router.post('/registrar-salida-caja', operacionesDiariasController.registrarSalidaCaja);
router.get('/consultar-inventario-insumos/:sucursalId', operacionesDiariasController.consultarInventarioInsumos);
router.post('/registrar-movimiento-inventario', operacionesDiariasController.registrarMovimientoInventario);
router.post('/registrar-compra-insumo', operacionesDiariasController.registrarCompraInsumo);
router.put('/actualizar-inventario-insumos/:id', operacionesDiariasController.actualizarInventarioInsumos);
router.post('/check-caja',operacionesDiariasController.checkCajaAbierta);
router.put('/terminar-pedido/:id',operacionesDiariasController.terminarPedido);
router.get('/detalle-pedido/:id', pedidosController.getDetallePedido);
router.get('/pedido-monto-total/:registro_diario_id/:cliente_id',operacionesDiariasController.pedidoMontoTotalDiario);
router.put('/cierre-caja',operacionesDiariasController.cierrCaja);
router.get('/registros-diarios/:filtro/:cliente_id',operacionesDiariasController.reporteOperacionesDiarias);
router.get('/registros-diarios/:id/detalle/:cliente_id',operacionesDiariasController.reporteOperacionesDiariasDetalle);
router.get('/caja-inicial/:registro_diario_id/:cliente_id',operacionesDiariasController.getCajaInicial);
router.delete('/borrar-pedido/:id/:cliente_id', pedidosController.deletePedido);

module.exports = router;