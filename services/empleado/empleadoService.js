const e = require('express');
const db = require('../../model/empleado/db');
const { emit } = require('../../node');
const bcrypt = require('bcrypt');

const createEmpleadoService = async (data) => {
    const { id_user, password, legajo, fecha_ingreso, rol_id  } = data;
    // Validación de campos requeridos
    if (!id_user || !password || !legajo || !rol_id) {
      throw new Error('All fields are required');
    }
    const encrypPass = bcrypt.hashSync(password, 8)
    const newEmpleado = await db.createEmpleado({ id_user, encrypPass, legajo,fecha_ingreso, rol_id });
    return newEmpleado;
  }; 

  const getEmpleadoByIdService = async (id) => {
    const result = await db.getEmpleadoById(id);
    return result.rows[0];
  }

  const getEmpleadoListService = async () => {
    const result = await db.getEmpleados();
    return result.rows;
  }

  const updateEmpleadoService = async (empleadoId,data) => {
    const {  password, legajo,fecha_ingreso, rol_id } = data;
    if ( !password || !legajo || !rol_id  ) {
      throw new Error('All fields are required');
    }
    
    const updatedEmpleado = await db.updateEmpleado(empleadoId, { password, legajo,fecha_ingreso, rol_id});
    return updatedEmpleado;
  }

  const deleteEmpleadoService = async (id) => {
    const result = await db.deleteEmpleado(id);
    if (!result) {
      return res.status(404).json({ error: 'Empleado not found' });
    }
    return result;
  }

  module.exports = {
    createEmpleadoService,
    getEmpleadoByIdService,
    getEmpleadoListService,
    updateEmpleadoService,
    deleteEmpleadoService
};