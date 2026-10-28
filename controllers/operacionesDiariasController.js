const operacionesDiariasService = require('../services/operaciones_diarias/operacionesDiariasService');



// Controlador para crear pedido
const crearPedido = async (req, res) => {
    
    try {

        const pedido = await operacionesDiariasService.crearPedido( req.body);
        res.status(201).json({status:'OK',idPedido:pedido});
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Controlador para listar pedidos
const listarPedidos = async (req, res) => {
    const { registroDiarioId, cliente_id } = req.params;
    try {
        const pedidos = await operacionesDiariasService.listarPedidosDiario(registroDiarioId,cliente_id);
        res.status(200).json(pedidos);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Controlador para registrar salida de caja
const registrarSalidaCaja = async (req, res) => {
    const { registroDiarioId, categoria, descripcion, monto, usuarioId, sucursalId,cliente_id } = req.body;
    try {
        const salidaCaja = await operacionesDiariasService.registrarSalidaCaja(registroDiarioId, categoria, descripcion, monto, usuarioId, sucursalId, cliente_id);
        res.status(201).json(salidaCaja);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const registrarAperturaCierreCaja = async (req, res) => {
    const { fecha, usuario_apertura_id, caja_inicial, sucursal_id, usuario_cierre_id, caja_final, cliente_id } = req.body;
    try {
        const registroCaja = await operacionesDiariasService.registrarAperturaCierreCaja(fecha, usuario_apertura_id, caja_inicial, sucursal_id, usuario_cierre_id, caja_final,cliente_id);
        res.status(201).json(registroCaja);
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
};

const checkCajaAbierta = async (req, res) => {
    const { cliente_id }  = req.body;
    try {
        const caja  = await operacionesDiariasService.checkCajaAbierta(cliente_id);
        res.status(201).json(caja)
    } catch (error) {
        res.status(500).json({ message : error.message });
    }
}

const terminarPedido =  async (req, res) => {
    const id = req.params.id;
    const {cliente_id} = req.body;
    try {
        const terminarPedido = await operacionesDiariasService.terminarPedidosDiario(id,cliente_id);
        res.status(200).json(terminarPedido);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

const pedidoMontoTotalDiario = async (req, res) => {
    const {registro_diario_id, cliente_id}  = req.params;
    try {
        const total  = await operacionesDiariasService.totalMontoTotalDiario(registro_diario_id,cliente_id);
        res.status(201).json(total)
    } catch (error) {
        res.status(500).json({ message : error.message });
    }
}

// Número opcional >= 0. undefined/null/'' => `vacio`; inválido => NaN.
const montoOpcional = (v, vacio) => {
    if (v === undefined || v === null || v === '') return vacio;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : NaN;
};

const cierrCaja = async (req, res) => {
    const { id, monto_final,usuario_cierre_id,sucursal_id,cliente_id, detalles } = req.body;
    const d = detalles || {};
    const efectivo_contado = montoOpcional(req.body.efectivo_contado, null);
    const otros_ingresos = montoOpcional(req.body.otros_ingresos ?? d.otros_ingresos, 0);
    const gastos_administrativos = montoOpcional(req.body.gastos_administrativos ?? d.gastos_administrativos, 0);
    if ([efectivo_contado, otros_ingresos, gastos_administrativos].some(Number.isNaN)) {
        return res.status(400).json({ message: 'Los montos del cierre deben ser números mayores o iguales a 0' });
    }
    try {
        const result = await operacionesDiariasService.actualizarRegistroDiarioService({id,monto_final, usuario_cierre_id, sucursal_id,cliente_id, efectivo_contado, otros_ingresos, gastos_administrativos });
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const reporteOperacionesDiarias = async (req, res) => {
    const {filtro, cliente_id}  = req.params;
    try {
        const result = await operacionesDiariasService.reporteOperacionesRegistroDiario(filtro,cliente_id);
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const reporteOperacionesDiariasDetalle = async (req, res) => {
    const {id, cliente_id}  = req.params;
    try {
        const result = await operacionesDiariasService.reporteOperacionesRegistroDiarioDetalle(id,cliente_id);
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getCajaInicial = async (req, res) => {
    const {registro_diario_id,cliente_id}  = req.params;
    try {
        const total  = await operacionesDiariasService.getCajaInicial(registro_diario_id,cliente_id);
        res.status(201).json(total)
    } catch (error) {
        res.status(500).json({ message : error.message });
    }
}




module.exports = {
    crearPedido,
    listarPedidos,
    registrarSalidaCaja,
    registrarAperturaCierreCaja,
    checkCajaAbierta,
    terminarPedido,
    pedidoMontoTotalDiario,
    cierrCaja,
    reporteOperacionesDiarias,
    getCajaInicial,
    reporteOperacionesDiariasDetalle
};


