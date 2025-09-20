
const empleadoService = require('../services/empleado/empleadoService');


const createEmpleado = async (req, res) => {
  const { id_user, password, legajo, fecha_ingreso, rol_id } = req.body;

  try {
    const newEmpleado = await empleadoService.createEmpleadoService({ id_user, password, legajo, fecha_ingreso, rol_id });
    res.status(201).json(newEmpleado);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const getEmpleadoById = async (req, res) => {
  const { id } = req.params;
  try {
    const empleado = await empleadoService.getEmpleadoByIdService(id);
      if (!empleado) {
        return res.status(404).json({ error: 'Empleado not found' });
      }
      res.status(200).json(empleado);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};


const getEmpleados = async (req, res) => {
  try {
    const result = await empleadoService.getEmpleadoListService();
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const updateEmpleado = async (req, res) => {
  const empleadoId = req.params.id;
  const {  password, legajo, fecha_ingreso, rol_id } = req.body;
  try {
    const updatedEmpleado = await empleadoService.updateEmpleadoService(empleadoId, {  password, legajo, fecha_ingreso, rol_id  });
    res.status(200).json(updatedEmpleado);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const deleteEmpleado = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await empleadoService.deleteEmpleadoService(id);
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  createEmpleado,
  getEmpleadoById,
  getEmpleados,
  updateEmpleado,
  deleteEmpleado
};

