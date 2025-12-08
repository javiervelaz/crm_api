// node.js o index.js
require('dotenv').config();
const cors = require('cors');


const express = require('express');
const app = express();
const port = process.env.PORT || 3001;
app.use(cors());
const registroDiarioRoutes = require('./routes/registroDiario');
const userRoutes = require('./routes/users');
const rolRoutes = require("./routes/rol");
const empRoutes = require("./routes/empleado");
const authRoutes = require("./routes/auth");
const moduloRoutes = require("./routes/modulo");
const permisoRoutes = require("./routes/permiso");
const rolPermisoRoutes = require("./routes/rolPermiso");
const moduloRolRoutes = require("./routes/moduloRol");
const profileRoutes = require("./routes/profile");
const userRolRoutes = require("./routes/userRol");
const operacionesRoutes = require("./routes/operacionesDiarias");
const medioPagoRoutes = require("./routes/medioPago");
const productoRoutes = require("./routes/producto");
const tipoPoductoRoutes = require("./routes/tipoProducto");
const categoriaSalida = require("./routes/categoriaSalida");
const salidaCaja  = require("./routes/salidaCaja");
const reportes  = require("./routes/reportes");
const authToken =  require("./routes/auth");
const categoriaTipo  = require("./routes/categoriaTipo")
const handoffRoutes = require('./routes/handoff');
const clienteRoutes = require('./routes/cliente');
const clientePlanRoutes = require('./routes/clientePlan');
const billingRoutes = require('./routes/billing');
const billingWebhookRoutes = require('./routes/billingWebhook');
const tiersRoutes = require('./routes/tiers');


app.use(express.json());
app.use('/api/registro_diario', registroDiarioRoutes);
app.use('/api/users', userRoutes);
app.use('/api/rol', rolRoutes);
app.use('/api/empleado', empRoutes);
app.use("/api/auth",authRoutes);
app.use("/api/modulo",moduloRoutes);
app.use("/api/permiso",permisoRoutes);
app.use("/api/rolpermiso",rolPermisoRoutes);
app.use("/api/modulorol",moduloRolRoutes);
app.use("/api/profile",profileRoutes);
app.use("/api/userrol",userRolRoutes);
app.use('/api/operaciones',operacionesRoutes);
app.use('/api/medioPago',medioPagoRoutes);
app.use('/api/producto',productoRoutes);
app.use('/api/tipo-producto',tipoPoductoRoutes);
app.use('/api/categoria-salida',categoriaSalida);
app.use('/api/salida-caja',salidaCaja);
app.use("/api/reportes",reportes)
app.use("/api/token",authToken);
app.use('/api/categoria-tipo',categoriaTipo)
app.use('/api/handoff', handoffRoutes);
app.use('/api/cliente',clienteRoutes)
app.use('/api/cliente-plan', clientePlanRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/billing/webhook', billingWebhookRoutes);
app.use('/api/tiers', tiersRoutes);



app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

module.exports = app; // Exportar la aplicación para las pruebas