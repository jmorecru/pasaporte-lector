// Utilidades compartidas entre pantallas. Sin dependencias.

/** Escapa también comillas, porque interpolamos dentro de atributos (src, style…). */
export function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Quita etiquetas HTML de un texto. Las sinopsis de Google Books suelen venir
 * en texto plano, pero algunas traen <p> y <br>, y al escaparlas se verían tal
 * cual en pantalla.
 */
export function stripTags(str) {
  return String(str == null ? '' : str)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Cualquier fecha en ISO corto (YYYY-MM-DD), en hora local: ordenable y sin ambigüedad. */
export function dateISO(d = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Fecha de hoy en ISO corto. */
export function todayISO() {
  return dateISO(new Date());
}

/**
 * "YYYY-MM-DD" → Date a medianoche en hora LOCAL.
 *
 * A propósito no se usa `new Date(iso)`: el constructor de cadena interpreta
 * una fecha sin hora como medianoche UTC, no local. En un mapa como
 * `minutesByDay` las claves se generan con `dateISO()` (en local), así que
 * hay que volver a leerlas con el mismo criterio o las comparaciones de racha
 * y de semana/mes podrían desplazarse un día según la zona horaria.
 */
export function parseISODate(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** ISO corto → DD/MM/YYYY para mostrar. */
export function formatDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso || '');
}

/** 0 → "0 min" · 45 → "45 min" · 90 → "1 h 30 min" · 120 → "2 h" */
export function formatMinutes(min) {
  const m = Math.max(0, Math.round(Number(min) || 0));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const resto = m % 60;
  return resto ? `${h} h ${resto} min` : `${h} h`;
}

/** Milisegundos → "M:SS" o "H:MM:SS", para el cronómetro en marcha. */
export function formatChrono(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const dos = n => String(n).padStart(2, '0');
  return h ? `${h}:${dos(m)}:${dos(s)}` : `${m}:${dos(s)}`;
}

// ---- ISBN ----
// Los códigos de barras de los libros son EAN-13, que para libros coincide con
// el ISBN-13 (empieza por 978 o 979). Los libros antiguos llevan ISBN-10.

/** Quita guiones y espacios. "978-84-204-8305-4" → "9788420483054" */
function cleanIsbn(raw) {
  return String(raw == null ? '' : raw).replace(/[\s-]/g, '').toUpperCase();
}

/** ¿Tiene pinta de ISBN, aunque el dígito de control esté mal? */
export function looksLikeIsbn(raw) {
  const s = cleanIsbn(raw);
  return /^\d{13}$/.test(s) || /^\d{9}[\dX]$/.test(s);
}

/**
 * Devuelve el ISBN limpio si es válido, o null.
 * Comprueba el dígito de control, que es lo que distingue un ISBN mal copiado de
 * un número cualquiera: sin esa comprobación buscaríamos códigos inexistentes y
 * el usuario solo vería "sin resultados", sin saber que se equivocó al teclear.
 */
export function normalizeIsbn(raw) {
  const s = cleanIsbn(raw);
  if (/^\d{13}$/.test(s)) {
    // ISBN-13: dígitos alternando peso 1 y 3; la suma debe ser múltiplo de 10.
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += Number(s[i]) * (i % 2 ? 3 : 1);
    return (10 - (sum % 10)) % 10 === Number(s[12]) ? s : null;
  }
  if (/^\d{9}[\dX]$/.test(s)) {
    // ISBN-10: pesos de 10 a 1; la suma debe ser múltiplo de 11. La X vale 10.
    let sum = 0;
    for (let i = 0; i < 10; i++) sum += (s[i] === 'X' ? 10 : Number(s[i])) * (10 - i);
    return sum % 11 === 0 ? s : null;
  }
  return null;
}

/** Un DDMM es válido si el día y el mes existen. No comprobamos el año. */
export function isValidDDMM(code) {
  if (!/^\d{4}$/.test(code)) return false;
  const day = parseInt(code.slice(0, 2), 10);
  const month = parseInt(code.slice(2), 10);
  const daysInMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth[month - 1];
}

/** Mensajes de error de Firebase traducidos a algo que se pueda leer. */
export function describeError(err) {
  if (!err) return 'error desconocido';
  const map = {
    'permission-denied': 'las reglas de Firestore no permiten esta operación',
    'unavailable': 'sin conexión con la base de datos',
    'auth/invalid-email': 'ese correo no tiene un formato válido',
    'auth/email-already-in-use': 'ya existe una cuenta con ese correo',
    'auth/weak-password': 'la contraseña es demasiado corta (mínimo 6 caracteres)',
    'auth/invalid-credential': 'correo o contraseña incorrectos',
    'auth/wrong-password': 'correo o contraseña incorrectos',
    'auth/user-not-found': 'no hay ninguna cuenta con ese correo',
    'auth/too-many-requests': 'demasiados intentos seguidos; espera un momento',
    'auth/network-request-failed': 'no se pudo conectar; revisa la conexión',
    'auth/operation-not-allowed': 'falta habilitar Correo/Contraseña en la consola de Firebase'
  };
  return map[err.code] || err.message || String(err);
}
