const e = require('express');
const db = require('../../model/reportes/db');
const { emit } = require('../../node');
const bcrypt = require('bcrypt');

  const getReporteWithFiltersService = async (data) => {
    const result = await db.getReporteVentasWithFilters(data);
    return result;
  }; 


  const getReporteClientesWithFiltersService = async (data) => {
    const result = await db.getReporteClientesWithFilters(data);
    return result;
  }; 
  const getReporteGatosPorTipoService = async (data) => {
    console.log("data",data);
    const result = await db.getReporteGastosPorTipoCategoria(data);
    return result;
  };

  const getReporteGatosPorCategoriaSalidaService = async (data) => {
    console.log("data",data);
    const result = await db.getReporteGastosPorCategoriaSalida(data);
    return result;
  };

  const getCategoriaSalidaService = async () => {
    const result = await db.getCategoriaSalida();
    return result;
  };
  const getCategoriaTipoService = async () => {
    const result = await db.getCategoriaTipo();
    return result;
  };

  module.exports = {
    getReporteWithFiltersService,
    getReporteGatosPorTipoService,
    getReporteGatosPorCategoriaSalidaService,
    getCategoriaSalidaService,
    getCategoriaTipoService,
    getReporteClientesWithFiltersService
};