require('dotenv').config();

// Fail fast: sin estas variables no arranca
['JWT_SECRET', 'POSTGRES_URL', 'HANDOFF_JWT_SECRET', 'CRON_SECRET'].forEach((k) => {
  if (!process.env[k]) throw new Error(`Falta variable de entorno: ${k}`);
});

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const app = express();

const { authenticateJWT } = require('./middleware/authMiddleware');
const { scopeTenant } = require('./middleware/tenantMiddleware');
const { withTenantConnection} = require('./middleware/tenantConnection');

app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({
  origin: (process.env.CORS_ORIGINS || 'http://localhost:3000').split(',').map(o => o.trim()),
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));
app.use('/api/signup', require('./routes/signup'));
app.use('/api/verify-email', require('./routes/verifyEmail'));
// ─── PÚBLICAS: no pasan por authenticateJWT ni scopeTenant ────────────────
app.use('/api/auth',            require('./routes/auth'));
app.use('/api/saas',            require('./routes/saas'));           // alta pública
app.use('/api/tiers',           require('./routes/tiers'));          // catálogo de planes
app.use('/api/billing/webhook', require('./routes/billingWebhook')); // firma HMAC propia
app.use('/api/handoff',         require('./routes/handoff'));        // JWT de handoff propio
//app.use('/api/cron',            require('./routes/cron'));           // CRON_SECRET

// ─── PLATAFORMA: cross-tenant por diseño, token separado ──────────────────
app.use('/api/platform',        require('./routes/platform'));
// Estas montan ANTES del withTenantConnection: llaman a MP y a Meta
app.use('/api/billing',  authenticateJWT, scopeTenant, require('./routes/billing'));
app.use('/api/whatsaap', authenticateJWT, scopeTenant, require('./routes/whatsaap'));
// ─── TENANT: todo lo demás. Auth + scope obligatorios, sin excepciones ────
app.use('/api', authenticateJWT, scopeTenant, withTenantConnection);

app.use('/api/registro_diario',   require('./routes/registroDiario'));
app.use('/api/users',             require('./routes/users'));
app.use('/api/rol',               require('./routes/rol'));
app.use('/api/empleado',          require('./routes/empleado'));
app.use('/api/modulo',            require('./routes/modulo'));
app.use('/api/permiso',           require('./routes/permiso'));
app.use('/api/rolpermiso',        require('./routes/rolPermiso'));
app.use('/api/modulorol',         require('./routes/moduloRol'));
app.use('/api/profile',           require('./routes/profile'));
app.use('/api/userrol',           require('./routes/userRol'));
app.use('/api/operaciones',       require('./routes/operacionesDiarias'));
app.use('/api/medioPago',         require('./routes/medioPago'));
app.use('/api/producto',          require('./routes/producto'));
app.use('/api/tipo-producto',     require('./routes/tipoProducto'));
app.use('/api/categoria-salida',  require('./routes/categoriaSalida'));
app.use('/api/salida-caja',       require('./routes/salidaCaja'));
app.use('/api/reportes',          require('./routes/reportes'));
app.use('/api/categoria-tipo',    require('./routes/categoriaTipo'));
app.use('/api/cliente',           require('./routes/cliente'));
app.use('/api/cliente-plan',      require('./routes/clientePlan'));
app.use('/api/billing',           require('./routes/billing'));
app.use('/api/whatsaap',          require('./routes/whatsaap'));

// ─── Health, 404, errores ─────────────────────────────────────────────────
const pool = require('./pool');
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', uptime: process.uptime() });
  } catch {
    res.status(503).json({ status: 'db_down' });
  }
});

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

app.use((err, req, res, next) => {
  console.error(err.stack);
  const isProd = process.env.NODE_ENV === 'production';
  res.status(err.status || 500).json({
    error: isProd ? 'Error interno del servidor' : err.message,
  });
});

const port = process.env.PORT || 3001;
const server = app.listen(port, () => console.log(`API en :${port}`));

// Graceful shutdown: sin esto cada deploy corta requests en vuelo
process.on('SIGTERM', () => {
  console.log('SIGTERM — cerrando');
  server.close(() => pool.end().then(() => process.exit(0)));
  setTimeout(() => process.exit(1), 10_000);
});

module.exports = app;