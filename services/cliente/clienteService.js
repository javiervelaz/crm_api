
const db = require('../../model/cliente/db');
const pool = require('../../pool');
const bcrypt = require('bcrypt');
const { createSubscription, saveSubscription } = require('../../services/billing/mercadoPagoService');
const { sendWelcomeEmail } = require('../../services/email/emailService');

  const createClienteService = async (data) => {
    const {
      nombre,
      cuit,
      adminNombre,
      adminApellido,
      adminEmail,
      adminDni,
      plan,
      telefono,
      adminPassword,
      canal_alta,
    } = data;

    if (!nombre || !cuit) throw new Error('nombre y cuit son obligatorios');
    if (!adminNombre || !adminApellido || !adminEmail) throw new Error('datos del usuario administrador incompletos');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const tierCode = (plan || 'FREE').toUpperCase();
      const tierRes = await client.query('SELECT * FROM tier WHERE UPPER(code) = $1', [tierCode]);
      const tier = tierRes.rows[0];
      const tierId = tier?.id ?? (await client.query('SELECT id FROM tier WHERE code = $1', ['FREE'])).rows[0]?.id;

      const canalAltaValue = canal_alta || 'landing';

      const clienteRes = await client.query(`
        INSERT INTO cliente (
          nombre, cuit, contacto_nombre, contacto_apellido,
          contacto_email, contacto_telefono, tier_id, canal_alta
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [nombre, cuit, adminNombre, adminApellido, adminEmail, telefono, tierId, canalAltaValue]
      );
      const cliente = clienteRes.rows[0];
      console.log("cliente id ",cliente.id)
      const userTypes = (await client.query('SELECT * FROM "user_type"')).rows;
      const adminUserType = userTypes.find((ut) => ut.codigo === 'ADMIN');
      if (!adminUserType) throw new Error('user_type "admin" no está configurado');

      const userRes = await client.query(`
        INSERT INTO "user" (nombre, apellido, email, user_type_id, cliente_id)
        VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [adminNombre, adminApellido, adminEmail, adminUserType.id, cliente.id]
      );
      const user = userRes.rows[0];

      const hashedPassword = await bcrypt.hash(adminPassword || 'Cambiar123', 10);
      const today = new Date().toISOString().slice(0, 10);
      const legajo = `ADMIN-${cliente.id}`;
      await client.query(`
        INSERT INTO profile (id_user, dni, telefono, password, legajo, fecha_ingreso, casa_nro, barrio, cliente_id)
        VALUES ($1,$2,$3,$4,$5,$6,null,null,$7)`,
        [user.id, adminDni || 0, telefono, hashedPassword, legajo, today, cliente.id]
      );

      const rolesCliente = [];
      let rolAdmin = null;
      for (const ut of userTypes) {
        const rolRes = await client.query(`
          INSERT INTO rol (descripcion, cliente_id) VALUES ($1,$2) RETURNING *`,
          [ut.descripcion || ut.codigo, cliente.id]
        );
        const rol = rolRes.rows[0];
        rolesCliente.push(rol);
        await client.query(`INSERT INTO user_rol (id_rol, id_user, cliente_id) VALUES ($1,$2,$3)`,
          [rol.id, user.id, cliente.id]);
        if (ut.codigo === 'ADMIN') rolAdmin = rol;
      }

      const modulosMaestro = (await client.query(`
        SELECT codigo, descripcion, status FROM modulo_maestro WHERE status = true`)).rows;

      const modulosCliente = [];
      for (const mm of modulosMaestro) {
        const mRes = await client.query(`
          INSERT INTO modulo (codigo, descripcion, status, cliente_id)
          VALUES ($1,$2,$3,$4) RETURNING *`,
          [mm.codigo, mm.descripcion, mm.status, cliente.id]
        );
        const modulo = mRes.rows[0];
        modulosCliente.push(modulo);
        await client.query(`INSERT INTO modulo_rol (id_rol, id_modulo, cliente_id) VALUES ($1,$2,$3)`,
          [rolAdmin.id, modulo.id, cliente.id]);
      }

      const acciones = (await client.query(`SELECT id, codigo, descripcion FROM permiso_accion ORDER BY id`)).rows;
      for (const modulo of modulosCliente) {
        for (const acc of acciones) {
          const permRes = await client.query(`
            INSERT INTO permiso (descripcion, codigo, modulo_id, cliente_id, es_global)
            VALUES ($1,$2,$3,$4,false) RETURNING *`,
            [`${acc.descripcion} - ${modulo.descripcion}`, `${modulo.codigo}.${acc.codigo}`, modulo.id, cliente.id]
          );
          const permiso = permRes.rows[0];
          await client.query(`INSERT INTO rol_permiso (rol_id, permiso_id, cliente_id) VALUES ($1,$2,$3)`,
            [rolAdmin.id, permiso.id, cliente.id]);
        }
      }

      

      await client.query('COMMIT');
      

      await sendWelcomeEmail({
        to: adminEmail,
        nombreComercio: cliente.nombre,
        plan: tierCode,
        urlLogin: process.env.PLATFORM_LOGIN_URL || 'https://app.tu-crm.com/login',
      });

      // 🔸 Mercado Pago
      let paymentUrl = null;
      if (tierCode !== 'FREE' && tier) {
        const mpSub = await createSubscription(cliente, tier);
        paymentUrl = mpSub.initPoint;
        await saveSubscription(cliente.id, tier.id, mpSub.preapprovalId);
      }
      return {
        cliente,
        adminUser: {
          id: user.id,
          nombre: user.nombre,
          apellido: user.apellido,
          email: user.email,
        },
        roles: rolesCliente.map((r) => ({ id: r.id, descripcion: r.descripcion })),
        modulos: modulosCliente.map((m) => ({ id: m.id, codigo: m.codigo, descripcion: m.descripcion })),
        ...(paymentUrl && { paymentUrl }),
      };
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Error en createClienteService:', err);
      throw err;
    } finally {
      client.release();
    }
  };

 

  const getClienteByIdService = async (id,cliente_id) => {
    const result = await db.getClienteById(id,cliente_id);
    return result;
  }

  const getClienteListService = async (cliente_id) => {
    const result = await db.getClientes(cliente_id);
    return result;
  }

  const updateClienteService = async (ClienteId,Cliente) => {
    const { codigo,descripcion,status,cliente_id } = Cliente;
   
    const updatedCliente = await db.updateCliente(ClienteId, { codigo,descripcion,status,cliente_id});
    return updatedCliente;
  }

  const deleteClienteService = async (id,cliente_id) => {
    const result = await db.deleteCliente(id,cliente_id);
    if (!result) {
      return res.status(404).json({ error: 'Cliente not found' });
    }
    return result;
  }



  module.exports = {
    createClienteService,
    getClienteByIdService,
    getClienteListService,
    updateClienteService,
    deleteClienteService,
};