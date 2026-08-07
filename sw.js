// Service worker deliberadamente vacío.
//
// La app no necesita funcionar sin conexión: depende de Firestore en vivo, y
// tener un service worker cacheando ficheros añadiría justo el problema que
// más nos ha costado hoy (código viejo pegado en un dispositivo). Este
// fichero no intercepta ninguna petición ni guarda nada en caché.
//
// Existe solo porque algunos navegadores (Firefox para Android, confirmado)
// exigen que exista un service worker registrado para considerar la web
// "instalable de verdad" y usar el icono y el nombre del manifiesto al
// añadirla a la pantalla de inicio. Sin él, caen a un acceso directo simple
// con el favicon pequeño y el título de la pestaña.
//
// Si alguna vez hace falta funcionamiento sin conexión de verdad, aquí es
// donde iría — pero no antes de que haga falta.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

// A propósito no hay listener de 'fetch': sin él, el navegador sirve todo
// directamente de la red, exactamente igual que sin service worker.
