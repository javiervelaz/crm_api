// services/harness/gastronomia/catalogo.js — intents de gastronomía.
//
// Cada intent declara name + modulo + permiso (+ feature, rubros) y un ejecutor
// que devuelve { texto }. El ejecutor SOLO corre si core/autorizacion lo permitió.
// Los ejecutores no escriben nada: el harness interno es de consulta.

const consultas = require('../../../model/harness/consultas');
const { ventanaODefault, parsearVentana } = require('../core/ventana');
const { normalizar } = require('../core/normalizar');
const { moneda, entero, plural, variacion } = require('../core/formato');
const { validarCatalogo } = require('../core/autorizacion');

const RUBROS = ['gastronomia'];
const VENTAS = { modulo: 'reportes', permiso: 'reportes.list', feature: 'canUseReports', rubros: RUBROS };
const GASTOS = { modulo: 'gasto', permiso: 'gasto.list', rubros: RUBROS };

const MSG_INVALIDA = (v) => `No pude entender la fecha "${v.texto}". Probá con otra, por ejemplo "el 15 de octubre" o "del 1 al 15".`;
const MSG_FUTURO = (v) => `${v.etiqueta} todavía no llegó, no hay datos para mostrar.`;
/** "octubre" → "en octubre"; "el mes pasado", "hoy", "esta semana" se dejan. */
const en = (etiqueta) => (/^(hoy|ayer|anteayer|el |la |los |las |esta |este |del |de )/.test(etiqueta) ? etiqueta : `en ${etiqueta}`);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** Resuelve la ventana del turno. Devuelve { v } o { respuesta } si hay que cortar. */
const ventanaDelTurno = (turno, ctx, porDefecto) => {
  const v = ventanaODefault(turno.texto, { hoy: ctx.hoy, tz: ctx.timezone }, porDefecto);
  if (v.invalida) return { respuesta: { texto: MSG_INVALIDA(v) } };
  if (v.futuro) return { respuesta: { texto: MSG_FUTURO(v) } };
  return { v };
};

// ─── ventas ────────────────────────────────────────────────────────────────
const ventasPeriodo = async (turno, ctx) => {
  const { v, respuesta } = ventanaDelTurno(turno, ctx, 'hoy');
  if (respuesta) return respuesta;
  const t = await consultas.ventasTotales(ctx.clienteId, v.desde, v.hasta);
  if (t.pedidos === 0) return { texto: `No registraste ventas ${en(v.etiqueta)}.` };
  const lineas = [`Ventas ${en(v.etiqueta)}: ${moneda(t.total)} en ${plural(t.pedidos, 'pedido', 'pedidos')}.`];
  if (t.pedidos > 1) lineas.push(`Ticket promedio: ${moneda(t.ticket)}.`);
  if (v.desde !== v.hasta) {
    const mejor = await consultas.ventasMejorDia(ctx.clienteId, v.desde, v.hasta);
    if (mejor) lineas.push(`Mejor día: ${mejor.fecha.split('-').reverse().join('/')} con ${moneda(mejor.total)}.`);
  }
  return { texto: lineas.join('\n') };
};

const singular = (palabra) => palabra.replace(/(?<=\w{3})(es|s)$/, '');
const tokensDe = (s) => normalizar(s).split(' ').filter((x) => x.length > 2 && !['de', 'del', 'las', 'los', 'con'].includes(x)).map(singular);

/** Productos del comercio cuyo nombre contiene todos los tokens del término. */
const buscarProductos = (term, productos) => {
  const tokens = tokensDe(term);
  if (!tokens.length) return [];
  return productos.filter((p) => {
    const nombre = normalizar(p.nombre);
    return tokens.every((tk) => nombre.includes(tk));
  });
};

const ventasProducto = async (turno, ctx) => {
  const { v, respuesta } = ventanaDelTurno(turno, ctx, 'hoy');
  if (respuesta) return respuesta;
  const ventana = parsearVentana(turno.texto, { hoy: ctx.hoy, tz: ctx.timezone });
  const term = ventana?.texto ? turno.producto.replace(ventana.texto, ' ').trim() : turno.producto;
  const productos = await consultas.productosDelComercio(ctx.clienteId);
  const hallados = buscarProductos(term, productos);
  if (!hallados.length) {
    return { texto: `No encontré un producto que se parezca a "${term}". Escribilo como figura en tu carta.` };
  }
  if (hallados.length > 8) return { texto: `"${term}" coincide con ${hallados.length} productos. Probá con un nombre más específico.` };
  const filas = await consultas.ventasPorProductos(ctx.clienteId, hallados.map((p) => p.id), v.desde, v.hasta);
  const porId = new Map(filas.map((f) => [f.id, f]));
  const lista = hallados.map((p) => porId.get(p.id) || { id: p.id, nombre: p.nombre, unidades: 0, total: '0' });
  if (lista.length === 1) {
    const f = lista[0];
    return { texto: `${f.nombre}, ${en(v.etiqueta)}: ${plural(f.unidades, 'unidad', 'unidades')} (${moneda(f.total)}).` };
  }
  const totalU = lista.reduce((a, f) => a + f.unidades, 0);
  return {
    texto: [`Ventas de "${term}", ${en(v.etiqueta)}: ${plural(totalU, 'unidad', 'unidades')}.`,
      ...lista.map((f) => `• ${f.nombre}: ${entero(f.unidades)} (${moneda(f.total)})`)].join('\n'),
  };
};

const PARES = [
  { re: /\bsemana\b/, actual: 'esta semana', previa: 'la semana pasada', mismoTramo: 'semana' },
  { re: /\b(hoy|ayer)\b/, actual: 'hoy', previa: 'ayer', mismoTramo: null },
  { re: /\bano\b/, actual: 'este ano', previa: 'el ano pasado', mismoTramo: 'anio' },
  { re: /./, actual: 'este mes', previa: 'el mes pasado', mismoTramo: 'mes' },
];

const aDate = (s) => new Date(`${s}T00:00:00Z`);
const aStr = (d) => d.toISOString().slice(0, 10);

/** Tramo equivalente del período anterior, hasta el mismo punto (no mes completo vs mes a medias). */
const tramoPrevio = (actual, previa, tipo) => {
  if (!tipo) return previa;
  const dias = Math.round((aDate(actual.hasta) - aDate(actual.desde)) / 86400000);
  const hasta = aStr(new Date(aDate(previa.desde).getTime() + dias * 86400000));
  return { ...previa, hasta: hasta < previa.hasta ? hasta : previa.hasta };
};

const ventasComparar = async (turno, ctx) => {
  const par = PARES.find((p) => p.re.test(turno.texto));
  const opt = { hoy: ctx.hoy, tz: ctx.timezone };
  const actual = parsearVentana(par.actual, opt);
  const previaCompleta = parsearVentana(par.previa, opt);
  const previa = tramoPrevio(actual, previaCompleta, par.mismoTramo);
  const [a, p, pc] = await Promise.all([
    consultas.ventasTotales(ctx.clienteId, actual.desde, actual.hasta),
    consultas.ventasTotales(ctx.clienteId, previa.desde, previa.hasta),
    previa.hasta === previaCompleta.hasta ? null : consultas.ventasTotales(ctx.clienteId, previaCompleta.desde, previaCompleta.hasta),
  ]);
  const var$ = variacion(a.total, p.total);
  const lineas = [
    `Ventas ${en(actual.etiqueta)}: ${moneda(a.total)} (${plural(a.pedidos, 'pedido', 'pedidos')}).`,
    `${cap(previaCompleta.etiqueta)}${pc ? ' (mismo tramo)' : ''}: ${moneda(p.total)} (${plural(p.pedidos, 'pedido', 'pedidos')}).`,
  ];
  if (var$) lineas.push(`Variación: ${var$}.`);
  else if (Number(p.total) === 0) lineas.push('No hay ventas en el período anterior para comparar.');
  if (pc && pc.total !== p.total) lineas.push(`${cap(previaCompleta.etiqueta)} completo: ${moneda(pc.total)}.`);
  return { texto: lineas.join('\n') };
};

// ─── gastos ────────────────────────────────────────────────────────────────
const gastosPeriodo = async (turno, ctx) => {
  const { v, respuesta } = ventanaDelTurno(turno, ctx, 'hoy');
  if (respuesta) return respuesta;
  const tipos = await consultas.gastosPorTipo(ctx.clienteId, v.desde, v.hasta);
  if (!tipos.length) return { texto: `No registraste gastos ${en(v.etiqueta)}.` };
  const total = await consultas.gastosTotal(ctx.clienteId, v.desde, v.hasta);
  const top = await consultas.gastosPorDescripcion(ctx.clienteId, v.desde, v.hasta);
  return {
    texto: [`Gastos ${en(v.etiqueta)}: ${moneda(total)}.`,
      ...tipos.map((t) => `• ${cap(t.tipo)}: ${moneda(t.total)}`),
      '', 'Lo más grande:', ...top.map((d) => `• ${d.detalle}: ${moneda(d.total)}`)].join('\n'),
  };
};

const gastosSueldos = async (turno, ctx) => {
  const { v, respuesta } = ventanaDelTurno(turno, ctx, 'este mes');
  if (respuesta) return respuesta;
  const tipos = await consultas.gastosPorTipo(ctx.clienteId, v.desde, v.hasta);
  const su = tipos.find((t) => t.codigo === 'SU');
  if (!su) return { texto: `No registraste sueldos ${en(v.etiqueta)}.` };
  const detalle = await consultas.gastosPorDescripcion(ctx.clienteId, v.desde, v.hasta, { codigoTipo: 'SU', limite: 10 });
  return {
    texto: [`Sueldos ${en(v.etiqueta)}: ${moneda(su.total)} en ${plural(su.cantidad, 'pago', 'pagos')}.`,
      ...detalle.map((d) => `• ${d.detalle}: ${moneda(d.total)}`)].join('\n'),
  };
};

// ─── clientes ──────────────────────────────────────────────────────────────
const clientesNuevos = async (turno, ctx) => {
  const { v, respuesta } = ventanaDelTurno(turno, ctx, 'este mes');
  if (respuesta) return respuesta;
  const n = await consultas.clientesNuevos(ctx.clienteId, v.desde, v.hasta);
  return { texto: n === 0 ? `No hubo clientes nuevos ${en(v.etiqueta)}.` : `Clientes nuevos ${en(v.etiqueta)}: ${entero(n)}.` };
};

// ─── caja ──────────────────────────────────────────────────────────────────
const ddmm = (f) => f.slice(5).split('-').reverse().join('/');
const lineaCaja = (c) => `Inicial ${moneda(c.caja_inicial)} · ventas ${moneda(c.ventas)} (${plural(c.pedidos, 'pedido', 'pedidos')}) · gastos ${moneda(c.gastos)}`;

const estadoCaja = async (turno, ctx) => {
  const abiertas = await consultas.cajasAbiertas(ctx.clienteId);
  if (!abiertas.length) return { texto: 'No hay ninguna caja abierta ahora.' };
  if (abiertas.length === 1) return { texto: `La caja está abierta (desde el ${ddmm(abiertas[0].fecha)}).\n${lineaCaja(abiertas[0])}.` };
  return {
    texto: [`Hay ${abiertas.length} cajas abiertas, conviene cerrarlas:`,
      ...abiertas.map((c) => `• ${ddmm(c.fecha)}: ${lineaCaja(c)}`)].join('\n'),
  };
};

const ultimoCierre = async (turno, ctx) => {
  const c = await consultas.ultimoCierre(ctx.clienteId);
  if (!c) return { texto: 'Todavía no hay cierres de caja registrados.' };
  const final = c.caja_final == null ? 'sin monto final registrado' : `final ${moneda(c.caja_final)}`;
  return { texto: `Último cierre: ${ddmm(c.fecha)}.\n${lineaCaja(c)} · ${final}.` };
};

const AYUDA = [
  'Podés preguntarme, por ejemplo:',
  '• ¿Cuánto vendí hoy? / ayer / esta semana / en octubre',
  '• ¿Cuántas hamburguesas vendí del 1 al 15?',
  '• ¿En qué gasté esta semana?',
  '• ¿Cuánto pagué de sueldos el mes pasado?',
  '• Compará las ventas de este mes con el mes pasado',
  '• ¿Cuántos clientes nuevos tuve en octubre?',
  '• ¿Está abierta la caja? / ¿Cómo fue el último cierre de caja?',
].join('\n');

const CAJA = { modulo: 'cerrarcaja', permiso: 'cerrarcaja.list', rubros: RUBROS };

const CATALOGO = validarCatalogo([
  { name: 'ayuda', publico: true, ejecutar: async () => ({ texto: AYUDA }) },
  { name: 'ventas_periodo', ...VENTAS, ejecutar: ventasPeriodo },
  { name: 'ventas_producto', ...VENTAS, ejecutar: ventasProducto },
  { name: 'ventas_comparar', ...VENTAS, ejecutar: ventasComparar },
  { name: 'clientes_nuevos', ...VENTAS, ejecutar: clientesNuevos },
  { name: 'gastos_periodo', ...GASTOS, ejecutar: gastosPeriodo },
  { name: 'gastos_sueldos', ...GASTOS, ejecutar: gastosSueldos },
  { name: 'estado_caja', ...CAJA, ejecutar: estadoCaja },
  { name: 'ultimo_cierre', ...CAJA, ejecutar: ultimoCierre },
]);

module.exports = { CATALOGO, AYUDA, _internos: { buscarProductos, tramoPrevio } };
