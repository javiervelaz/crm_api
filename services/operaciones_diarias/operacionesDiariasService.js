const CompraInsumo = require('../../model/compra_insumo/db');
const InventarioInsumos = require('../../model/inventario_insumo/db');
const MovimientoInventario = require('../../model/movimiento_inventario/db');
const SalidaCaja = require('../../model/salida_caja/db');
const Pedido = require('../../model/pedido/db');
const RegistroDiario = require('../../model/registro_diario/db');
const  Users  = require("../../model/users/db") 
const Profile   =  require("../../model/profile/db");
const { json } = require('body-parser');

// Lógica para registrar una compra de insumos
exports.registrarCompraInsumo = async (registroDiarioId, insumo, cantidad, precioTotal, usuarioId, sucursalId) => {
    try {
        const nuevaCompra = await CompraInsumo.createCompraInsumo({
            registro_diario_id: registroDiarioId,
            insumo,
            cantidad,
            precio_total: precioTotal,
            usuario_id: usuarioId,
            sucursal_id: sucursalId
        });
        return nuevaCompra;
    } catch (error) {
        throw new Error('Error registrando la compra de insumos: ' + error.message);
    }
};

// Lógica para actualizar el inventario de insumos
exports.actualizarInventarioInsumos = async (Id, inventarioInsumo) => {
    const {sucursal_id, nombre, cantidad} = inventarioInsumo;
    try {
        const inventario = await InventarioInsumos.getInventarioInsumoById(Id); 
        if (inventario) {
            inventario.cantidad += cantidad;
            return await InventarioInsumos.updatetInventarioInsumo(Id,{inventario});
             
        } else {
            return await InventarioInsumos.createInventarioInsumo({ sucursal_id: sucursal_id, nombre, cantidad })
        }
    } catch (error) {
        throw new Error('Error actualizando el inventario de insumos: ' + error.message);
    }
};

// Lógica para registrar movimiento de inventario
exports.registrarMovimientoInventario = async (inventarioInsumosId, registroDiarioId, tipoMovimiento, cantidad) => {
    try {
        const movimiento = await MovimientoInventario.createMovimientoInventario({
            inventario_insumos_id: inventarioInsumosId,
            registro_diario_id: registroDiarioId,
            tipo_movimiento: tipoMovimiento,
            cantidad
        });
        return movimiento;
    } catch (error) {
        throw new Error('Error registrando movimiento de inventario: ' + error.message);
    }
};

// Lógica para registrar salida de caja
exports.registrarSalidaCaja = async (registroDiarioId, categoria, descripcion, monto, usuarioId, sucursalId,cliente_id) => {
    try {
        const salidaCaja = await SalidaCaja.createSalidaCaja({
            registro_diario_id: registroDiarioId,
            categoria,
            descripcion,
            monto,
            usuario_id: usuarioId,
            sucursal_id: sucursalId,
            cliente_id: cliente_id
        });
        return salidaCaja;
    } catch (error) {
        throw new Error('Error registrando salida de caja: ' + error.message);
    }
};

// Lógica para registrar un pedido
exports.crearPedido = async ( data) => {
    const { registro_diario_id,usuario_id,monto_total,sucursal_id,medio_pago_id,cliente_nombre, cliente_telefono, productos,cliente_casa_nro, cliente_barrio ,pedido_obs,user_cliente_id,paga_efectivo,vuelto_pago_efectivo, monto_adicional,cliente_id} = data;  
    try {
        const pedido_data = await Pedido.getComandaNro(registro_diario_id);
        const comandaCount = parseInt(pedido_data[0].count, 10); // base 10
        const nuevoNumeroComanda = comandaCount === 0 ? 1 : comandaCount + 1;
        const pedidoId = await Pedido.createPedido({
            registro_diario_id: registro_diario_id,
            usuario_id: usuario_id,
            monto_total: monto_total,
            sucursal_id: sucursal_id,
            medio_pago_id: medio_pago_id,
            observacion: pedido_obs,
            comanda_nro: nuevoNumeroComanda,
            productos,
            user_cliente_id : user_cliente_id,
            paga_efectivo:paga_efectivo,
            vuelto_pago_efectivo:vuelto_pago_efectivo,
            cliente_id : cliente_id,
            monto_adicional: monto_adicional
        });
        
        // Insertar los productos relacionados en la tabla intermedia
        await Pedido.insertPedidoProducto(pedidoId, productos); 
        if(cliente_telefono != 1){
            const profileByTelefono  = await Profile.getByTelefono(cliente_telefono,cliente_id);
        if(profileByTelefono == null) {
            const fecha = new Date();
            let user = {nombre:cliente_nombre, apellido:cliente_nombre, email:cliente_nombre+'@gmail.com', user_type_id : 4, cliente_id: cliente_id};
            let newUser =  await  Users.createUser(user)
            let profile = {id_user:newUser.id, dni:0,telefono:cliente_telefono,password:123456,legajo:0,fecha_ingreso:fecha.toISOString(),casa_nro:cliente_casa_nro, barrio: cliente_barrio, cliente_id:cliente_id}
            await Profile.createProfile(profile);
            }
        }
        
        return pedidoId;
    } catch (error) {
        throw new Error('Error registrando pedido4: ' + error.message);
    }
};

// Lógica para registrar apertura y cierre de caja
exports.registrarAperturaCierreCaja = async (fecha, usuarioAperturaId, cajaInicial, sucursalId, usuarioCierreId, cajaFinal,cliente_id) => {
    try {
        const registroExists = await RegistroDiario.getByRegistroFechaUsuario(fecha,cliente_id); 
        
        if(registroExists.length !== 0){
            throw new Error('El registro ya fue creado para este dia.');
        }
        const registroCaja = await RegistroDiario.createRegistroDiario({
            fecha,
            usuario_apertura_id: usuarioAperturaId,
            caja_inicial: cajaInicial,
            sucursal_id: sucursalId,
            usuario_cierre_id: usuarioCierreId,
            caja_final: cajaFinal,
            cliente_id: cliente_id,
        });
        return registroCaja;
    } catch (error) {
        throw new Error('Error registrando apertura o cierre de caja: ' + error.message);
    }
};

exports.checkCajaAbierta  = async (fecha,cliente_id) => {
    try {
        const registroExists = await RegistroDiario.getByRegistroFechaUsuario(fecha,cliente_id);
        if(registroExists.length !== 0){
            const caja_abierta = registroExists.length !== 0;
            const fechaApertura = caja_abierta ? registroExists[0].fecha : null;
            const registro_diario_id = registroExists[0].id;
            return { caja_abierta: caja_abierta, fecha: fechaApertura , registro_diario_id: registro_diario_id};
        }else{
            return false;
        }
        
    }
    catch (error) {
        throw new Error('Error registrando apertura o cierre de caja: ' + error.message);
    }
}

exports.listarPedidosDiario =  async (idRegistroDiarios,cliente_id) => {
    const result = await Pedido.getPedidoByRegistroId(idRegistroDiarios,cliente_id);
    return result.rows;
}

exports.terminarPedidosDiario =  async (id,cliente_id) => {
    const result = await Pedido.terminarPedido(id,cliente_id);
    return result.rows;
}

exports.totalMontoTotalDiario  = async (registro_diario_id,cliente_id) => {
    try {
        const total = await Pedido.getPedidosMontoTotalDiario(registro_diario_id,cliente_id);
        return total;
    }
    catch (error) {
        throw new Error('Error al obtener monto total diario' + error.message);
    }
}

exports.actualizarRegistroDiarioService = async (data) => {
    const {id,monto_final, usuario_cierre_id, sucursal_id, cliente_id} = data;
    try {
        const result = await RegistroDiario.updateMontoFinalRegistroDiario(id,monto_final, usuario_cierre_id, sucursal_id,cliente_id);
        return result.rows;
    } catch (error) {
        throw new Error('Error actualizando monto final en el registro diario ' + error.message);
    }
};

exports.reporteOperacionesRegistroDiario  = async (filtro,cliente_id) => {
    try {
        const result = await RegistroDiario.getRegistrosDiarios(filtro,cliente_id);
        return result;
    }
    catch (error) {
        throw new Error('Error al obtener listado' + error.message);
    }
}

exports.reporteOperacionesRegistroDiarioDetalle  = async (id,cliente_id) => {
    try {
        const result = await RegistroDiario.getRegistrosDiariosDetalle(id,cliente_id);
        return result;
    }
    catch (error) {
        throw new Error('Error al obtener listado' + error.message);
    }
}



exports.getCajaInicial  = async (registro_diario_id,cliente_id) => {
    try {
        const total = await RegistroDiario.getCajaInicial(registro_diario_id,cliente_id);
        return total;
    }
    catch (error) {
        throw new Error('Error al obtener monto total diario' + error.message);
    }
}


