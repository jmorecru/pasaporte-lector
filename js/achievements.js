// Metas e insignias de lectura.
//
// Las insignias son un catálogo FIJO, no configurable — al estilo de Oxford
// Reading Buddy, que es donde los niños de esta familia ya están
// acostumbrados a verlas en el colegio. Los umbrales dan un empujón rápido al
// principio (el primer libro, una racha corta) y se van espaciando después.
//
// Todo lo de aquí son funciones puras: reciben datos, devuelven datos, no
// tocan Firestore ni el DOM. Eso permite comprobar la lógica de fechas con
// casos de prueba antes de que dependa de nada en pantalla.

import { dateISO, parseISODate } from './util.js';

// Además de `check` (si está conseguida), cada insignia lleva `descripcion`,
// `meta`, `unidad` y `valor(ctx)` — no hacen falta para desbloquear nada, son
// para poder explicarla al tocarla: "llevas 3 de 5 libros", con fecha de
// consecución si ya está lograda. `check` se deja explícito en vez de
// derivarlo de `valor >= meta` porque así se lee de un vistazo sin tener que
// saltar a otra línea.
export const BADGES = [
  // Libros terminados (total acumulado)
  { key: 'libros-1', label: 'Primer Sello', emoji: '📖',
    descripcion: 'Termina tu primer libro.', meta: 1, unidad: 'libro',
    valor: ctx => ctx.librosTerminados, check: ctx => ctx.librosTerminados >= 1 },
  { key: 'libros-5', label: 'Aprendiz de Lector', emoji: '📚',
    descripcion: 'Termina 5 libros.', meta: 5, unidad: 'libros',
    valor: ctx => ctx.librosTerminados, check: ctx => ctx.librosTerminados >= 5 },
  { key: 'libros-10', label: 'Lector Aventurero', emoji: '🗺️',
    descripcion: 'Termina 10 libros.', meta: 10, unidad: 'libros',
    valor: ctx => ctx.librosTerminados, check: ctx => ctx.librosTerminados >= 10 },
  { key: 'libros-25', label: 'Maestro Lector', emoji: '🏆',
    descripcion: 'Termina 25 libros.', meta: 25, unidad: 'libros',
    valor: ctx => ctx.librosTerminados, check: ctx => ctx.librosTerminados >= 25 },
  { key: 'libros-50', label: 'Leyenda de la Biblioteca', emoji: '👑',
    descripcion: 'Termina 50 libros.', meta: 50, unidad: 'libros',
    valor: ctx => ctx.librosTerminados, check: ctx => ctx.librosTerminados >= 50 },

  // Ritmo: varios libros en poco tiempo (equivalente a "Book Boss" de Oxford)
  { key: 'ritmo-semana-3', label: 'Semana Imparable', emoji: '⚡',
    descripcion: 'Termina 3 libros en la misma semana.', meta: 3, unidad: 'libros esta semana',
    valor: ctx => ctx.librosEstaSemana, check: ctx => ctx.librosEstaSemana >= 3 },
  { key: 'ritmo-mes-6', label: 'Mes de Récord', emoji: '🔥',
    descripcion: 'Termina 6 libros en el mismo mes.', meta: 6, unidad: 'libros este mes',
    valor: ctx => ctx.librosEsteMes, check: ctx => ctx.librosEsteMes >= 6 },

  // Minutos acumulados de por vida
  { key: 'minutos-60', label: 'Primera Hora', emoji: '⏱️',
    descripcion: 'Lee 60 minutos en total.', meta: 60, unidad: 'min',
    valor: ctx => ctx.minutosTotales, check: ctx => ctx.minutosTotales >= 60 },
  { key: 'minutos-300', label: 'Maratón de Lectura', emoji: '🏃',
    descripcion: 'Lee 300 minutos en total (5 horas).', meta: 300, unidad: 'min',
    valor: ctx => ctx.minutosTotales, check: ctx => ctx.minutosTotales >= 300 },
  { key: 'minutos-1200', label: 'Superlector', emoji: '💪',
    descripcion: 'Lee 1200 minutos en total (20 horas).', meta: 1200, unidad: 'min',
    valor: ctx => ctx.minutosTotales, check: ctx => ctx.minutosTotales >= 1200 },

  // Rachas de días seguidos leyendo
  { key: 'racha-3', label: 'Racha de 3', emoji: '🔥',
    descripcion: 'Lee 3 días seguidos.', meta: 3, unidad: 'días seguidos',
    valor: ctx => ctx.rachaDias, check: ctx => ctx.rachaDias >= 3 },
  { key: 'racha-7', label: 'Semana Completa', emoji: '🌟',
    descripcion: 'Lee 7 días seguidos.', meta: 7, unidad: 'días seguidos',
    valor: ctx => ctx.rachaDias, check: ctx => ctx.rachaDias >= 7 },
  { key: 'racha-30', label: 'Mes Perfecto', emoji: '🏅',
    descripcion: 'Lee 30 días seguidos.', meta: 30, unidad: 'días seguidos',
    valor: ctx => ctx.rachaDias, check: ctx => ctx.rachaDias >= 30 },

  // Variedad
  { key: 'colecciones-3', label: 'Explorador de Sagas', emoji: '🧭',
    descripcion: 'Termina libros de 3 colecciones distintas.', meta: 3, unidad: 'colecciones',
    valor: ctx => ctx.coleccionesDistintas, check: ctx => ctx.coleccionesDistintas >= 3 },
  { key: 'valoraciones-10', label: 'Crítico Literario', emoji: '⭐',
    descripcion: 'Pon tu valoración a 10 libros.', meta: 10, unidad: 'libros valorados',
    valor: ctx => ctx.librosValorados, check: ctx => ctx.librosValorados >= 10 }
];

/** Lunes de la semana que contiene `fecha`, a medianoche local. */
function inicioDeSemana(fecha) {
  const d = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
  const dia = d.getDay();               // 0 = domingo … 6 = sábado
  const desplazamiento = dia === 0 ? -6 : 1 - dia;   // retrocede hasta el lunes
  d.setDate(d.getDate() + desplazamiento);
  return d;
}

/** Día 1 del mes que contiene `fecha`, a medianoche local. */
function inicioDeMes(fecha) {
  return new Date(fecha.getFullYear(), fecha.getMonth(), 1);
}

/**
 * Días consecutivos con alguna sesión, contando hacia atrás desde hoy.
 *
 * Si hoy todavía no hay ninguna sesión registrada, se cuenta desde ayer: sin
 * este detalle, la racha "desaparecería" a los ojos del niño cada mañana
 * antes de que le diera tiempo a leer, aunque la racha siguiera intacta.
 */
function calcularRacha(minutesByDay, ahora) {
  if (!minutesByDay) return 0;
  let cursor = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  if (!(minutesByDay[dateISO(cursor)] > 0)) {
    cursor.setDate(cursor.getDate() - 1);
  }
  let racha = 0;
  while (minutesByDay[dateISO(cursor)] > 0) {
    racha++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return racha;
}

/**
 * Resumen de lectura de un niño, a partir de sus libros y de su mapa de
 * minutos por día. `ahora` es un parámetro (no `new Date()` por defecto medido
 * dentro de un bucle) precisamente para poder pasarle fechas fijas en pruebas.
 */
export function resumenLectura(books, minutesByDay, ahora) {
  const inicioSemana = inicioDeSemana(ahora);
  const inicioMes = inicioDeMes(ahora);

  const terminados = books.filter(b => b.status === 'terminado' && b.finishedAt);
  const librosEstaSemana = terminados.filter(b => parseISODate(b.finishedAt) >= inicioSemana).length;
  const librosEsteMes = terminados.filter(b => parseISODate(b.finishedAt) >= inicioMes).length;

  const minutosTotales = books.reduce((suma, b) => suma + (b.totalMinutes || 0), 0);

  const colecciones = new Set();
  terminados.forEach(b => {
    const nombre = (b.collection || '').trim().toLowerCase();
    if (nombre) colecciones.add(nombre);
  });

  const librosValorados = books.filter(b => b.rating).length;

  const dias = minutesByDay || {};
  const minutosHoy = dias[dateISO(ahora)] || 0;
  let minutosEstaSemana = 0;
  for (const [diaISO, minutos] of Object.entries(dias)) {
    if (parseISODate(diaISO) >= inicioSemana) minutosEstaSemana += minutos;
  }

  return {
    librosTerminados: terminados.length,
    librosEstaSemana,
    librosEsteMes,
    minutosTotales,
    minutosHoy,
    minutosEstaSemana,
    coleccionesDistintas: colecciones.size,
    librosValorados,
    rachaDias: calcularRacha(dias, ahora)
  };
}

/** Insignias del catálogo que `ctx` ya cumple y que no estaban desbloqueadas. */
export function insigniasNuevas(ctx, clavesDesbloqueadas) {
  return BADGES.filter(b => !clavesDesbloqueadas.has(b.key) && b.check(ctx));
}
