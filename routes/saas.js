const express = require('express');
const router = express.Router();
const { enforceParamTenant } = require('../middleware/tenantMiddleware');
router.use(enforceParamTenant);
const pool = require('../pool');
const bcrypt = require('bcrypt');
const { createOneTimePayment } = require('../services/billing/mercadoPagoService');

router.post('/', async (req, res) => {
  try {
    const {
      plan,
      comercioNombre,
      cuit,
      adminNombre,
      adminApellido,
      adminEmail,
      adminDni,
      telefono,
      password,
    } = req.body;

    // Validaciones básicas
    if (!comercioNombre || !cuit || !adminNombre || !adminApellido || !adminEmail || !password) {
      return res.status(400).json({ message: 'Faltan datos obligatorios.' });
    }

    const existingCliente = await pool.query('SELECT id FROM cliente WHERE cuit = $1', [cuit]);
    if (existingCliente.rows.length > 0) {
      return res.status(400).json({ message: 'Ya existe un cliente con ese CUIT.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Buscar tier por código
    const tierRes = await pool.query('SELECT * FROM tier WHERE UPPER(code) = $1', [plan.toUpperCase()]);
    const tier = tierRes.rows[0];
    if (!tier) {
      return res.status(400).json({ message: 'Plan no encontrado.' });
    }

    // Crear cliente
    const clienteRes = await pool.query(
      `INSERT INTO cliente (nombre, apellido, razon_social, cuit, nombre_comercio, tier_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [adminNombre, adminApellido, comercioNombre, cuit, comercioNombre, tier.id]
    );
    const cliente = clienteRes.rows[0];

    // Crear usuario admin
    await pool.query(
      `INSERT INTO usuario (cliente_id, nombre, apellido, email, dni, telefono, password, rol)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'admin')`,
      [cliente.id, adminNombre, adminApellido, adminEmail, adminDni, telefono, hashedPassword]
    );

    // Si el plan es pago → generar pago único y devolver initPoint
    const isPago = tier.precio_mensual > 0 && tier.duracion_meses > 0;
    if (isPago) {
      const { initPoint } = await createOneTimePayment(cliente, tier);
      return res.json({ message: 'Cuenta creada. Redirigiendo a pago...', paymentUrl: initPoint });
    }

    res.json({ message: 'Cuenta creada correctamente.' });
  } catch (err) {
    console.error('Error en /api/saas:', err);
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
});

module.exports = router;
