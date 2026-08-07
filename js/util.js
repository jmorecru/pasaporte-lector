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

/** Fecha de hoy en ISO corto (YYYY-MM-DD): ordenable y sin ambigüedad. */
export function todayISO() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** ISO corto → DD/MM/YYYY para mostrar. */
export function formatDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso || '');
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
