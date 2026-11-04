// routes/curador.js — reporte para el agente curador de intents.
//
// Token PROPIO y de solo lectura (CURADOR_TOKEN), no el de plataforma: con el
// PLATFORM_ADMIN_TOKEN se pueden activar módulos de cualquier comercio, y un
// agente que corre fuera de la infraestructura no tiene por qué poder eso.
// Este token alcanza para UN endpoint de lectura agregada, sin ids de comercios
// ni de usuarios. Si la variable no está o es corta, el endpoint queda cerrado
// (503) en vez de tirar abajo el arranque de toda la API.
const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { construirReporte } = require('../services/harness/curador/reporte');

const iguales = (a, b) => a.length === b.length && crypto.timingSafeEqual(a, b);

router.use((req, res, next) => {
  const esperado = process.env.CURADOR_TOKEN;
  if (!esperado || esperado.length < 32) {
    return res.status(503).json({ error: 'Curador no configurado' });
  }
  const h = req.headers.authorization || '';
  const recibido = Buffer.from(h.startsWith('Bearer ') ? h.slice(7) : '');
  if (!iguales(recibido, Buffer.from(esperado))) {
    console.warn(`[CURADOR] acceso no autorizado desde ${req.ip}`);
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

router.get('/reporte', async (req, res, next) => {
  try {
    res.json(await construirReporte({ dias: req.query.dias }));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
