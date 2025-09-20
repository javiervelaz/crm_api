const pool = require('../../pool');

const createSalidaCaja  = async (RegistroDiario) => {
    const sucursal_id =1; 
    const { registro_diario_id, categoria_salida_id, descripcion, monto,usuario_id } = RegistroDiario;
    const result = await pool.query(
      'INSERT INTO "salida_caja" (registro_diario_id, categoria_salida_id, descripcion, monto,usuario_id,sucursal_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [registro_diario_id, categoria_salida_id, descripcion, monto,usuario_id,sucursal_id]
    );
    return result.rows[0];
  };
  
  const getSalidaCajaById = async (id) => {
    const result = await pool.query('SELECT * FROM "salida_caja" WHERE id = $1', [id]);
    return result;
  };
  
  const   getSalidasCajas  = async () => {
    const result = await pool.query('SELECT * FROM "salida_caja" where DATE(created_at)  = DATE(now())', []);
    return result;
  }
  
  
  const updateSalidaCaja   = async (id, user) => {
    const {registro_diario_id, categoria, descripcion, monto,usuario_id,sucursal_id } = user;
    const result = await pool.query(
      'UPDATE "salida_caja" SET fecha = $1, usuario_apertura_id = $2, usuario_cierre_id = $3, caja_inicial = $4,caja_final =$5, sucursal_id=$6, updated_at = CURRENT_TIMESTAMP WHERE id = $7 RETURNING *',
      [registro_diario_id, categoria, descripcion, monto,usuario_id,sucursal_id, id]
    );
    return result.rows[0];
  };
  
  const deleteSalidaCaja  = async (id) => {
    const result = await pool.query('DELETE FROM "salida_caja" WHERE id = $1 RETURNING *', [id]);
    return result.rows[0];
  };

  const getMontoTotalDiarioGastosPorTipo  = async (RegistroDiario,categoria_salida_id) => {
    const result = await pool.query(
      'select SUM(sc.monto) from salida_caja sc join categoria_tipo ct on sc.categoria_salida_id = ct.id where sc.registro_diario_id = $1 and ct.descripcion =  $2 ',
      [RegistroDiario,categoria_salida_id]
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