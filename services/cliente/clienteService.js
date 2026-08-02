// services/cliente/clienteService.js
const pool = require('../../pool');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { createSubscription, createOneTimePayment, saveSubscription } =
  require('../billing/mercadoPagoService');
const { sendWelcomeEmail } = require('../email/emailService');

const TZ = 'America/Argentina/Cordoba';
const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS ?? 12);

class SignupError extends Error {
  constructor(message, { status = 400, code = 'SIGNUP_ERROR', field } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.field = field;
  }
}

/**
 * Provisiona un tenant completo. Devuelve el cliente, el admin y el estado
 * del plan. NO hace I/O externo (mail, MercadoPago): eso lo decide el caller,
 * para que un fallo de red no deje la cuenta en estado ambiguo.
 */
const createClienteService = async (data) => {
  const {
    nombre, cuit, adminNombre, adminApellido, adminEmail, adminDni,
    plan, telefono, adminPassword, canal_alta,
    terminosVersion, signupIp, utmSource, utmCampaign,
  } = data;

  if (!adminPassword) {
    throw new SignupError('La contraseña es obligatoria', { field: 'password' });
  }

  const email = String(adminEmail).trim().toLowerCase();
  const cuitNorm = String(cuit).replace(/\D/g, '');

  // Hasheamos antes del BEGIN: bcrypt con 12 rounds tarda ~250ms
  // y no queremos esa transacción abierta ese tiempo de más.
  const hashedPassword = await bcrypt.hash(adminPassword, BCRYPT_ROUNDS);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Chequeo temprano para dar un mensaje útil.
    // Los índices únicos son la garantía real (ver catch de abajo).
    const dup = await client.query(
      `SELECT
         EXISTS(SELECT 1 FROM cliente WHERE cuit = $1)              AS cuit_taken,
         EXISTS(SELECT 1 FROM "user" WHERE lower(email) = $2)       AS email_taken`,
      [cuitNorm, email]
    );
    if (dup.rows[0].cuit_taken) {
      throw new SignupError('Ya existe una cuenta con ese CUIT', { code: 'CUIT_TAKEN', field: 'cuit' });
    }
    if (dup.rows[0].email_taken) {
      throw new SignupError('Ya existe una cuenta con ese email', { code: 'EMAIL_TAKEN', field: 'adminEmail' });
    }

    const tierCode = (plan || 'FREE').toUpperCase();
    const tierRes = await client.query(
      `SELECT * FROM tier WHERE UPPER(code) = $1 AND es_activo = true`, [tierCode]
    );
    let tier = tierRes.rows[0];

    if (!tier) {
      const freeRes = await client.query(`SELECT * FROM tier WHERE UPPER(code) = 'FREE'`);
      tier = freeRes.rows[0];
      if (!tier) throw new SignupError('Configuración de planes incompleta', { status: 500 });
    }

    const esPago = Number(tier.precio_mensual) > 0;

    // El plan pago arranca vencido: se activa cuando el webhook confirma.
    // Los días de trial del FREE definen su ventana.
    // $9/$10 siempre se referencian en la query (aunque esPago sea false):
    // si el placeholder no aparece en el texto, Postgres no puede inferirle
    // el tipo y falla con "could not determine data type of parameter".
    const clienteRes = await client.query(
      `INSERT INTO cliente (
         nombre, cuit, contacto_nombre, contacto_apellido,
         contacto_email, contacto_telefono, tier_id, canal_alta,
         tier_expiration_date, terminos_aceptados_at, terminos_version,
         signup_ip, utm_source, utm_campaign
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,
               CASE WHEN $9 THEN (now() AT TIME ZONE $10)::date ELSE NULL END,
               now(), $11, $12, $13, $14)
       RETURNING *`,
      [
        nombre, cuitNorm, adminNombre, adminApellido, email, telefono,
        tier.id, canal_alta || 'landing', esPago, TZ,
        terminosVersion || null, signupIp || null, utmSource || null, utmCampaign || null,
      ]
    );
    const cliente = clienteRes.rows[0];

    // ─── Provisioning: user_type → user → profile ────────────────────────
    const userTypes = (await client.query('SELECT * FROM "user_type"')).rows;
    const adminUserType = userTypes.find((ut) => ut.codigo === 'ADMIN');
    if (!adminUserType) {
      throw new SignupError('user_type "ADMIN" no está configurado', { status: 500 });
    }

    const userRes = await client.query(
      `INSERT INTO "user" (nombre, apellido, email, user_type_id, cliente_id)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [adminNombre, adminApellido, email, adminUserType.id, cliente.id]
    );
    const user = userRes.rows[0];

    await client.query(
      `INSERT INTO profile (id_user, dni, telefono, password, legajo, fecha_ingreso,
                            casa_nro, barrio, cliente_id)
       VALUES ($1,$2,$3,$4,$5, (now() AT TIME ZONE $7)::date, null, null, $6)`,
      [user.id, adminDni || 0, telefono, hashedPassword, `ADMIN-${cliente.id}`, cliente.id, TZ]
    );

    // ─── Roles ───────────────────────────────────────────────────────────
    const rolesCliente = [];
    let rolAdmin = null;
    for (const ut of userTypes) {
      const { rows } = await client.query(
        `INSERT INTO rol (descripcion, cliente_id) VALUES ($1,$2) RETURNING *`,
        [ut.descripcion || ut.codigo, cliente.id]
      );
      rolesCliente.push(rows[0]);
      if (ut.codigo === 'ADMIN') rolAdmin = rows[0];
    }
    if (!rolAdmin) throw new SignupError('No se pudo crear el rol admin', { status: 500 });

    // Sólo el rol admin se asigna al usuario que se registra
    await client.query(
      `INSERT INTO user_rol (id_rol, id_user, cliente_id) VALUES ($1,$2,$3)`,
      [rolAdmin.id, user.id, cliente.id]
    );

    // ─── Módulos ─────────────────────────────────────────────────────────
    const modulosMaestro = (await client.query(
      `SELECT codigo, descripcion, status FROM modulo_maestro WHERE status = true`
    )).rows;

    const modulosCliente = [];
    for (const mm of modulosMaestro) {
      const { rows } = await client.query(
        `INSERT INTO modulo (codigo, descripcion, status, cliente_id)
         VALUES ($1,$2,$3,$4) RETURNING *`,
        [mm.codigo, mm.descripcion, mm.status, cliente.id]
      );
      const modulo = rows[0];
      modulosCliente.push(modulo);

      for (const rol of rolesCliente) {
        if (mm.codigo === 'plan' && rol.id !== rolAdmin.id) continue;
        await client.query(
          `INSERT INTO modulo_rol (id_rol, id_modulo, cliente_id) VALUES ($1,$2,$3)`,
          [rol.id, modulo.id, cliente.id]
        );
      }
    }

    // ─── Permisos (batch: era N×M queries sueltas) ────────────────────────
    const acciones = (await client.query(
      `SELECT id, codigo, descripcion FROM permiso_accion ORDER BY id`
    )).rows;

    const permisoValues = [];
    for (const modulo of modulosCliente) {
      for (const acc of acciones) {
        permisoValues.push([
          `${acc.descripcion} - ${modulo.descripcion}`,
          `${modulo.codigo}.${acc.codigo}`,
          modulo.id,
          cliente.id,
        ]);
      }
    }

    if (permisoValues.length) {
      const { rows: permisos } = await client.query(
        `INSERT INTO permiso (descripcion, codigo, modulo_id, cliente_id, es_global)
         SELECT * FROM UNNEST(
           $1::text[], $2::text[], $3::int[], $4::int[]
         ) AS t(descripcion, codigo, modulo_id, cliente_id), LATERAL (SELECT false) AS g(es_global)
         RETURNING id`,
        [
          permisoValues.map((p) => p[0]),
          permisoValues.map((p) => p[1]),
          permisoValues.map((p) => p[2]),
          permisoValues.map((p) => p[3]),
        ]
      );

      await client.query(
        `INSERT INTO rol_permiso (rol_id, permiso_id, cliente_id)
         SELECT $1, unnest($2::int[]), $3`,
        [rolAdmin.id, permisos.map((p) => p.id), cliente.id]
      );
    }

    // Token de verificación de email (el envío es del caller)
    const verificationToken = crypto.randomBytes(32).toString('hex');
    await client.query(
      `INSERT INTO email_verification (token, cliente_id, user_id, email, expires_at)
       VALUES ($1,$2,$3,$4, now() + interval '7 days')`,
      [verificationToken, cliente.id, user.id, email]
    );

    await client.query('COMMIT');

    return {
      cliente,
      tier,
      esPago,
      verificationToken,
      adminUser: {
        id: user.id,
        nombre: user.nombre,
        apellido: user.apellido,
        email: user.email,
        cliente_id: cliente.id,
      },
      roles: rolesCliente.map((r) => ({ id: r.id, descripcion: r.descripcion })),
      modulos: modulosCliente.map((m) => ({ id: m.id, codigo: m.codigo, descripcion: m.descripcion })),
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});

    // Carrera entre el chequeo y el INSERT: el índice único la ataja
    if (err.code === '23505') {
      if (String(err.constraint).includes('cuit')) {
        throw new SignupError('Ya existe una cuenta con ese CUIT', { code: 'CUIT_TAKEN', field: 'cuit' });
      }
      if (String(err.constraint).includes('email')) {
        throw new SignupError('Ya existe una cuenta con ese email', { code: 'EMAIL_TAKEN', field: 'adminEmail' });
      }
    }

    console.error('[createClienteService]', err);
    throw err;
  } finally {
    client.release();
  }
};

/**
 * Ficha del propio tenant (endpoint /api/cliente/me).
 */
const getClienteByIdService = async (id) => {
  const { rows } = await pool.query(
    `SELECT id, nombre, cuit, contacto_nombre, contacto_apellido, contacto_email,
            contacto_telefono, tier_id, canal_alta, tier_expiration_date, created_at
       FROM cliente WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
};

const updateClienteService = async (id, data) => {
  const { nombre, contacto_nombre, contacto_apellido, contacto_email, contacto_telefono } = data;
  const { rows } = await pool.query(
    `UPDATE cliente SET
       nombre             = COALESCE($1, nombre),
       contacto_nombre    = COALESCE($2, contacto_nombre),
       contacto_apellido  = COALESCE($3, contacto_apellido),
       contacto_email     = COALESCE($4, contacto_email),
       contacto_telefono  = COALESCE($5, contacto_telefono),
       updated_at         = now()
     WHERE id = $6
     RETURNING id, nombre, cuit, contacto_nombre, contacto_apellido, contacto_email,
               contacto_telefono, tier_id, canal_alta, tier_expiration_date, created_at`,
    [nombre, contacto_nombre, contacto_apellido, contacto_email, contacto_telefono, id]
  );
  return rows[0] || null;
};

module.exports = {
  createClienteService,
  getClienteByIdService,
  updateClienteService,
  SignupError,
};