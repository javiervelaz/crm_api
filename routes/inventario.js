// routes/inventario.js — /api/inventario (JWT + scopeTenant + tx de tenant, ver node.js)
const express = require('express');
const { authorizeModule } = require('../middleware/moduleAuth');
const { authorizePermission } = require('../middleware/permissionMiddleware');
const { requireFeature } = require('../middleware/featureMiddleware');
const { requireLimit } = require('../middleware/limitMiddleware');
const { registerTenantGuards } = require('../middleware/tenantMiddleware');
const ctrl = require('../controllers/inventarioController');

const router = express.Router();
registerTenantGuards(router);

// Módulo y plan para todo el router; el permiso, por acción.
router.use(authorizeModule('inventario'), requireFeature('canUseInventario'));
const puede = (accion) => authorizePermission('inventario', `inventario.${accion}`);

router.get('/items',        puede('list'),   ctrl.listarItems);       // ?tipo=&bajo_minimo=&q=&incluir_inactivos=
router.get('/items/:id',    puede('list'),   ctrl.obtenerItem);
router.post('/items',       puede('create'), requireLimit('maxStockItems'), ctrl.crearItem);
router.put('/items/:id',    puede('update'), ctrl.actualizarItem);
router.delete('/items/:id', puede('delete'), ctrl.desactivarItem);   // baja lógica

router.get('/movimientos',  puede('list'),   ctrl.listarMovimientos); // ?stock_item_id=&limit=&offset=
router.post('/movimientos', puede('create'), ctrl.registrarMovimiento);

// Recetas: :id es el id del PRODUCTO (validado por registerTenantGuards)
router.get('/recetas',      puede('list'),   ctrl.listarRecetas);
router.get('/recetas/:id',  puede('list'),   ctrl.obtenerReceta);
router.put('/recetas/:id',  puede('update'), ctrl.guardarReceta);    // { lineas: [{ stock_item_id, cantidad, unidad? }] }

router.get('/alertas',      puede('list'),   ctrl.listarAlertas);     // bajo mínimo = lista de compras

module.exports = router;
