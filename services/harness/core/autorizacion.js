// services/harness/core/autorizacion.js — los tres ejes del harness interno.
//
//   rubro   el intent existe para el rubro del comercio (gastronomía ≠ educación)
//   plan    el comercio tiene la feature (rubro_tier.features, vía planService)
//   usuario la PERSONA tiene el módulo y el permiso (los mismos de su JWT)
//
// Reglas:
//  · Declarativo: cada intent del catálogo dice modulo + permiso (+ feature,
//    + rubros). Un intent sin modulo/permiso es un error de catálogo y no carga
//    (validarCatalogo): fail-closed, no "si no dice nada, pasa".
//  · No se ejecuta y después se filtra: si no está autorizado NO se ejecuta.
//  · La negativa no es un error (ok: true en el turno) y NO filtra el dato:
//    "Eso lo puede consultar el dueño", nunca "vendiste $X pero no podés verlo".
//  · Plan vencido = sin features pagas, igual que requireFeature.

const EJES = ['rubro', 'plan', 'modulo', 'permiso'];

const MENSAJES = {
  rubro: () => 'Eso no está disponible para tu tipo de comercio.',
  plan: () => 'Esa consulta viene con un plan pago. Lo podés ver en Counter → Plan.',
  modulo: () => 'Eso lo puede consultar el dueño o quien administre Counter en tu comercio.',
  permiso: () => 'Eso lo puede consultar el dueño o quien administre Counter en tu comercio.',
};

/** Valida el catálogo al cargarlo. Lanza con todos los problemas juntos. */
const validarCatalogo = (catalogo) => {
  const errores = [];
  const nombres = new Set();
  for (const it of catalogo) {
    if (!it || typeof it.name !== 'string' || !it.name) { errores.push('intent sin name'); continue; }
    if (nombres.has(it.name)) errores.push(`${it.name}: duplicado`);
    nombres.add(it.name);
    if (it.publico === true) continue; // ayuda, comandos: sin datos del comercio
    if (!it.modulo) errores.push(`${it.name}: falta modulo`);
    if (!it.permiso) errores.push(`${it.name}: falta permiso`);
    if (it.permiso && it.modulo && !String(it.permiso).startsWith(`${it.modulo}.`)) {
      errores.push(`${it.name}: el permiso ${it.permiso} no es del módulo ${it.modulo}`);
    }
    if (it.rubros != null && (!Array.isArray(it.rubros) || !it.rubros.length)) errores.push(`${it.name}: rubros vacío`);
  }
  if (errores.length) throw new Error(`Catálogo del harness inválido:\n - ${errores.join('\n - ')}`);
  return catalogo;
};

const tienePermiso = (permissions, modulo, permiso) => {
  const p = permissions || {};
  return (p[modulo] || []).includes(permiso) || (p._global || []).includes(permiso);
};

/**
 * ¿Puede este usuario, en este comercio, ejecutar este intent?
 * @param intent  entrada del catálogo
 * @param ctx     { rubroCodigo, features, isExpired, modules, permissions }
 * @returns { ok: true } | { ok: false, eje, mensaje }
 */
const autorizar = (intent, ctx) => {
  if (!intent) throw new Error('autorizar: intent requerido');
  if (intent.publico === true) return { ok: true };
  if (!intent.modulo || !intent.permiso) {
    // No debería llegar acá si el catálogo pasó por validarCatalogo; si llega, se niega.
    return { ok: false, eje: 'permiso', mensaje: MENSAJES.permiso() };
  }
  const negar = (eje) => ({ ok: false, eje, mensaje: MENSAJES[eje]() });

  if (Array.isArray(intent.rubros) && !intent.rubros.includes(ctx.rubroCodigo)) return negar('rubro');
  if (intent.feature && (ctx.isExpired === true || ctx.features?.[intent.feature] !== true)) return negar('plan');
  if (!(ctx.modules || []).includes(intent.modulo)) return negar('modulo');
  if (!tienePermiso(ctx.permissions, intent.modulo, intent.permiso)) return negar('permiso');
  return { ok: true };
};

module.exports = { autorizar, validarCatalogo, EJES, MENSAJES };
