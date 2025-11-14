const pool = require('../../pool');

const createSalidaCaja  = async (RegistroDiario) => {
    const sucursal_id =1; 
    const { registro_diario_id, categoria_salida_id, descripcion, monto,usuario_id, cliente_id } = RegistroDiario;
    const result = await pool.query(
      'INSERT INTO "salida_caja" (registro_diario_id, categoria_salida_id, descripcion, monto,usuario_id,sucursal_id,cliente_id) VALUES ($1, $2, $3, $4, $5, $6,$7) RETURNING *',
      [registro_diario_id, categoria_salida_id, descripcion, monto,usuario_id,sucursal_id, cliente_id]
    );
    return result.rows[0];
  };
  
  const getSalidaCajaById = async (id, cliente_id) => {
    const result = await pool.query('SELECT * FROM "salida_caja" WHERE id = $1 and cliente_id =  $2::int', [id, cliente_id]);
    return result;
  };
  
  const   getSalidasCajas  = async (id,cliente_id) => {
    const result = await pool.query('SELECT * FROM "salida_caja" where DATE(created_at)  = DATE(now()) and registro_diario_id =  $1 and cliente_id =  $2::int', [id,cliente_id]);
    return result;
  }
  
  
  const updateSalidaCaja   = async (id, user) => {
    const {
      registro_diario_id=null, 
      categoria=null,
      descripcion=null,
      monto=null,
      usuario_id=null,
      sucursal_id=null,
      cliente_id } = user;

    // Validaciones mínimas
    if (!id) throw new Error('Falta id');
    if (!cliente_id) throw new Error('Falta cliente_id');
    
    const { rows, rowCount } = await pool.query(
      `
      UPDATE "salida_caja" SET 
        fecha = COALESCE($1, fecha), 
        usuario_apertura_id = COALESCE($2, usuario_apertura_id), 
        usuario_cierre_id = COALESCE( $3,usuario_cierre_id), 
        caja_inicial = COALESCE($4,caja_inicial),
        caja_final = COALESCE($5, caja_final ),
        sucursal_id= COALESCE($6, sucursal_id),
        updated_at = CURRENT_TIMESTAMP 
        WHERE id = $8 AND cliente_id = $7::int 
        RETURNING *`,
      [
        registro_diario_id?? null,
        categoria?? null,
        descripcion?? null,
        monto?? null,
        usuario_id?? null,
        sucursal_id?? null,
        cliente_id,
        id]
    );
    if (rowCount === 0) throw new Error('Profile no encontrado');
    return rows[0];
  };
  
  const deleteSalidaCaja  = async (id, cliente_id) => {
    const result = await pool.query('DELETE FROM "salida_caja" WHERE id = $1 and cliente_id =  $2 RETURNING *', [id, cliente_id]);
    return result.rows[0];
  };

  const getMontoTotalDiarioGastosPorTipo  = async (RegistroDiario,categoria_salida_id, cliente_id) => {
    const result = await pool.query(
      'select SUM(sc.monto) from salida_caja sc join categoria_tipo ct on sc.categoria_salida_id = ct.id where sc.registro_diario_id = $1 and ct.descripcion =  $2 and sc.cliente_id =  $3',
      [RegistroDiario,categoria_salida_id, cliente_id]
    );
   
    return result.rows[0].sum;
  };
  
  
  module.exports = {
    createSalidaCaja,
    getSalidaCajaById,
    getSalidasCajas,
    updateSalidaCaja,
    deleteSalidaCaja,
    getMontoTotalDiarioGastosPorTipo
    };