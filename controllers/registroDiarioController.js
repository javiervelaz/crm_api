// controllers/registroDiarioController.js
const pool = require('../db');

const getRegistrosDiarios = async (req, res) => {
  const {  cliente_id } = req.params;
  if(!cliente_id) return res.status(404).json( { error: "No se puede filtrar por cliente"});
  try {
    const result = await pool.query('SELECT * FROM registro_diario where cliente_id =  $1',[cliente_id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const createRegistroDiario = async (req, res) => {
  const { fecha, usuario_apertura_id, caja_inicial, sucursal_id } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO registro_diario (fecha, usuario_apertura_id, caja_inicial, sucursal_id) VALUES ($1, $2, $3, $4) RETURNING *',
      [fecha, usuario_apertura_id, caja_inicial, sucursal_id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const updateRegistroDiario = async (req, res) => {
  const { id } = req.params;
  const { fecha, usuario_cierre_id, caja_final, sucursal_id } = req.body;
  try {
    const result = await pool.query(
      'UPDATE registro_diario SET fecha = $1, usuario_cierre_id = $2, caja_final = $3, sucursal_id = $4, updated_at = CURRENT_TIMESTAMP WHERE id = $5 RETURNING *',
      [fecha, usuario_cierre_id, caja_final, sucursal_id, id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const deleteRegistroDiario = async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM registro_diario WHERE id = $1', [id]);
    res.json({ message: 'Registro diario eliminado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const testConnection = async (req, res) => {
    try {
      const result = await pool.query('SELECT NOW()');
      res.json(result.rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };

module.exports = {
  getRegistrosDiarios,
  createRegistroDiario,
  updateRegistroDiario,
  deleteRegistroDiario,
  testConnection,
};
