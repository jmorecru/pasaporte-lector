// Marca de versión visible en pantalla.
//
// Sirve para comprobar de un vistazo si un dispositivo ha cargado el código
// publicado más reciente y no una copia en caché — el problema que nos ha
// hecho perder tiempo varias veces: el servidor tenía el cambio, la tablet no.
//
// Se sube a mano en cada despliegue que interese verificar. No hay build
// tools en este proyecto (a propósito, ver brief §2), así que no se genera
// solo; simplemente incrementa la letra al final cada vez.
export const APP_VERSION = '2026-08-07-h';
