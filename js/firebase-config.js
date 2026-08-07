// Configuración de tu proyecto de Firebase.
//
// Cómo rellenarla: consola de Firebase → ⚙ Configuración del proyecto →
// "Tus apps" → app web → "Configuración del SDK" → opción "Configuración".
// Copia los valores y pégalos aquí. Ver SETUP_FIREBASE.md para el paso a paso.
//
// Nota: estas claves NO son secretas. Van en el HTML de cualquier app web de
// Firebase y son públicas por diseño; quien protege los datos son las reglas
// de Firestore (firestore.rules), no esta configuración.

export const firebaseConfig = {
  apiKey: "AIzaSyA3QZEclzqtTvL4lK5xsX9UwhX8YniX5vg",
  authDomain: "pasaporte-lector.firebaseapp.com",
  projectId: "pasaporte-lector",
  storageBucket: "pasaporte-lector.firebasestorage.app",
  messagingSenderId: "82658396466",
  appId: "1:82658396466:web:4e9d7815145fbdc45cef2b"
};

// Clave para la API de Google Books. Necesaria en la práctica.
//
// Sin clave, Google mete todas las búsquedas anónimas del mundo en una única
// cuota compartida que está agotada de forma crónica: devuelve HTTP 429 desde
// cualquier red (comprobado desde red corporativa y doméstica).
// Con clave propia la cuota es nuestra: 1.000 consultas/día gratis.
//
// Cómo obtenerla: ver SETUP_FIREBASE.md, sección "Buscador de libros".
export const googleBooksApiKey = "AIzaSyDzKPwvMvjIWfGDeqc8nevKmK4f0cxOGC4";

// true mientras la configuración siga sin rellenar (la app muestra instrucciones
// en pantalla en vez de fallar con un error críptico de red).
export const isPlaceholderConfig =
  Object.values(firebaseConfig).some(v => typeof v === 'string' && v.includes('PEGA_AQUI'));
