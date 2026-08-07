// Escaneo del código de barras de un libro con la cámara.
//
// Dos motores, por este orden:
//
// 1. BarcodeDetector, la API del propio navegador. Gratis en peso: no
//    descarga nada. Pero su soporte es desigual incluso entre navegadores
//    Android — se comprobó en un Fire tablet real cuyo Silk expone la clase
//    pero `getSupportedFormats()` devuelve una lista vacía: no decodifica
//    absolutamente nada, ni códigos de barras ni QR.
//
// 2. ZXing (@zxing/library), cargada desde CDN solo si hace falta. Decodifica
//    el vídeo por software, así que funciona igual en cualquier dispositivo
//    sea cual sea su soporte nativo. Coste: ~97 KB comprimidos, una sola vez,
//    y solo para quien realmente necesite este segundo motor — un dispositivo
//    con buen soporte nativo (el caso normal) no la descarga nunca.
//
// Efecto colateral bueno, verificado en un iPhone real: al dejar de exigir
// BarcodeDetector para mostrar el botón, el escaneo también funciona en
// Safari/iOS vía ZXing (le falta la clase BarcodeDetector, pero sí tiene
// getUserMedia). La limitación de iOS que se documentó al principio del
// proyecto ha quedado desactualizada por este cambio.
//
// NOTA DE HISTORIAL: hubo una versión intermedia que recortaba el centro del
// fotograma para "acercar" digitalmente un código pequeño en el encuadre.
// Se retiró: el recorte daba por hecho una relación entre el vídeo en bruto
// y el recuadro visual en pantalla que no se cumple igual en todos los
// dispositivos (por el `object-fit:cover` del CSS), y calcularla mal dejaba
// el código fuera de la zona analizada — probablemente lo que rompió el
// escaneo en un iPhone donde antes sí funcionaba. Se vuelve al enfoque
// simple: se decodifica el fotograma completo, sin recortes.
//
// Requiere HTTPS en cualquier caso — en GitHub Pages hay; en local, no.

const FORMATOS_LIBRO = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];
const ZXING_URL = 'https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js';

/**
 * ¿Puede este dispositivo intentar escanear? Ya no exige el motor nativo: con
 * ZXing de repuesto, lo único imprescindible de verdad es poder pedir cámara.
 */
export function barcodeAvailable() {
  return window.isSecureContext
    && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

/** Prepara el motor nativo si existe y sabe leer códigos de libro. Si no, null. */
async function prepararDetectorNativo() {
  if (typeof window.BarcodeDetector !== 'function') return null;
  try {
    const soportados = await window.BarcodeDetector.getSupportedFormats();
    const formats = FORMATOS_LIBRO.filter(f => soportados.includes(f));
    if (!formats.length) {
      console.warn('BarcodeDetector no reconoce códigos de libro. Formatos que sí soporta:', soportados);
      return null;
    }
    return new window.BarcodeDetector({ formats });
  } catch (e) {
    console.warn('BarcodeDetector falló al prepararse, se probará ZXing', e);
    return null;
  }
}

// Se guarda la promesa, no solo el resultado: si dos escaneos se abren
// seguidos antes de que la primera carga termine, la segunda espera la misma
// descarga en vez de arrancar una segunda.
let cargaZXing = null;

/** Descarga ZXing la primera vez que hace falta; luego queda en caché del navegador. */
function cargarZXing() {
  if (window.ZXing) return Promise.resolve(window.ZXing);
  if (!cargaZXing) {
    cargaZXing = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = ZXING_URL;
      script.onload = () => resolve(window.ZXing);
      script.onerror = () => { cargaZXing = null; reject(new Error('No se pudo descargar el decodificador.')); };
      document.head.appendChild(script);
    });
  }
  return cargaZXing;
}

/**
 * Deja la cámara lo mejor puesta posible para leer un código de barras.
 *
 * Por defecto muchas cámaras arrancan con enfoque fijo o de un solo disparo, y
 * en primeros planos se quedan borrosas. Pedir enfoque continuo lo corrige
 * donde esté disponible. Es opcional en la especificación, así que se aplica
 * lo que haya y se ignora en silencio lo que no: nada de esto debe impedir
 * escanear.
 *
 * A propósito NO se toca el zoom: la API no distingue zoom óptico de digital,
 * y en una tablet sin zoom óptico de verdad (lo habitual) forzarlo recorta y
 * estira la imagen, añadiendo borrosidad justo en las líneas finas de un
 * código de barras — se detectó ese síntoma exacto en un Fire tablet real.
 */
async function ajustarCamara(stream, overlay) {
  const track = stream.getVideoTracks()[0];
  if (!track || typeof track.getCapabilities !== 'function') return;

  let caps = {};
  try { caps = track.getCapabilities() || {}; } catch (e) { return; }

  if (Array.isArray(caps.focusMode) && caps.focusMode.includes('continuous')) {
    try { await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }); } catch (e) { /* opcional */ }
  }

  // Linterna, si la hay: los códigos en papel satinado se leen fatal a contraluz.
  if (caps.torch) {
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'btn-torch';
    boton.textContent = '🔦 Luz';
    let encendida = false;
    boton.onclick = async () => {
      encendida = !encendida;
      try {
        await track.applyConstraints({ advanced: [{ torch: encendida }] });
        boton.classList.toggle('on', encendida);
      } catch (e) { console.warn('La linterna no respondió', e); }
    };
    overlay.querySelector('.scanner-video-wrap').appendChild(boton);
  }
}

/**
 * Abre la cámara y resuelve con el código leído, o con null si se cancela o
 * falla. Nunca lanza: los errores se cuentan en pantalla.
 */
export async function scanBarcode() {
  if (!barcodeAvailable()) return null;

  const overlay = document.createElement('div');
  overlay.className = 'overlay scanner-overlay';
  overlay.innerHTML = `
    <div class="scanner">
      <div class="scanner-video-wrap">
        <video id="scanner-video" playsinline muted autoplay></video>
        <div class="scanner-frame"></div>
      </div>
      <p class="scanner-status" id="scanner-status">Pidiendo permiso para usar la cámara…</p>
      <p class="field-hint">Apunta al código de barras de la contraportada, con buena luz. Se lee solo.</p>
      <div class="sheet-actions">
        <button class="btn-secondary" id="scanner-cancel">Cancelar</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const video = overlay.querySelector('#scanner-video');
  const status = overlay.querySelector('#scanner-status');

  let stream = null;
  let rafId = null;
  let zxingReader = null;
  let finished = false;

  const cleanup = () => {
    if (rafId) clearTimeout(rafId);
    if (zxingReader) { try { zxingReader.reset(); } catch (e) { /* ya suelto */ } }
    if (stream) stream.getTracks().forEach(t => t.stop());   // apaga la cámara
    overlay.remove();
  };

  return new Promise(resolve => {
    const finish = value => {
      if (finished) return;
      finished = true;
      cleanup();
      resolve(value);
    };

    overlay.querySelector('#scanner-cancel').onclick = () => finish(null);
    overlay.addEventListener('click', e => { if (e.target === overlay) finish(null); });

    (async () => {
      // El motor nativo no necesita cámara para prepararse, así que se intenta
      // antes de pedir permiso: si existe, nos ahorramos por completo la
      // descarga de ZXing.
      const detectorNativo = await prepararDetectorNativo();

      // Comprobar si hay cámara detectable antes de pedirla. Sin esto, un
      // dispositivo sin cámara trasera expuesta al navegador hace que
      // getUserMedia falle (o se quede colgado) sin más pista que "pantalla
      // en negro", que es indistinguible de un permiso denegado a simple vista.
      try {
        if (navigator.mediaDevices.enumerateDevices) {
          const dispositivos = await navigator.mediaDevices.enumerateDevices();
          const camaras = dispositivos.filter(d => d.kind === 'videoinput');
          if (!camaras.length) {
            status.textContent = 'Este dispositivo no tiene ninguna cámara accesible desde el navegador. Puedes escribir el ISBN a mano.';
            return;
          }
        }
      } catch (e) {
        // enumerateDevices sin permiso previo puede fallar o venir vacío en
        // algunos navegadores; no es motivo para rendirse, seguimos e
        // intentamos getUserMedia igualmente.
      }

      // Si getUserMedia ni concede ni deniega en un tiempo razonable, hay que
      // dejar de esperar y decirlo: quedarse colgado en "Pidiendo permiso…"
      // para siempre es indistinguible de que la app se haya congelado.
      const ATASCADO = Symbol('atascado');
      const conLimite = (promesa, ms) => Promise.race([
        promesa,
        new Promise(r => setTimeout(() => r(ATASCADO), ms))
      ]);

      try {
        const resultado = await conLimite(
          navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: 'environment' },   // cámara trasera
              // Un código de barras es un patrón fino: con la resolución por
              // defecto (a menudo 640x480) las barras se emborronan y hay que
              // acercarse mucho. Pidiendo más píxeles se lee desde más lejos.
              width: { ideal: 1920 },
              height: { ideal: 1080 }
            }
          }),
          8000
        );
        if (resultado === ATASCADO) {
          status.textContent = 'La cámara no responde en este navegador (se quedó esperando permiso sin preguntar). Puedes escribir el ISBN a mano.';
          return;
        }
        stream = resultado;
      } catch (e) {
        console.error('Cámara no disponible', e);
        const nombre = (e && e.name) || 'desconocido';
        const mensajes = {
          NotAllowedError: 'No has dado permiso para usar la cámara.',
          NotFoundError: 'No se ha encontrado ninguna cámara en este dispositivo.',
          NotReadableError: 'La cámara está en uso por otra aplicación ahora mismo.',
          OverconstrainedError: 'La cámara de este dispositivo no cumple lo que se le pide.',
          SecurityError: 'El navegador ha bloqueado el acceso a la cámara por seguridad.'
        };
        // El nombre técnico se deja siempre visible, aunque el mensaje sea
        // genérico: es lo que permite identificar un caso nuevo sin adivinar.
        status.textContent = `${mensajes[nombre] || 'No se pudo abrir la cámara.'} Puedes escribir el ISBN a mano. (${nombre})`;
        return;
      }

      await ajustarCamara(stream, overlay);
      if (finished) return;   // se canceló mientras se preparaba la cámara

      if (detectorNativo) {
        iniciarConMotorNativo(detectorNativo, video, stream, status, finish, () => finished);
        return;
      }

      // Sin motor nativo utilizable: cargamos ZXing bajo demanda.
      status.textContent = 'Preparando el lector de códigos…';
      let ZXing;
      try {
        ZXing = await cargarZXing();
      } catch (e) {
        console.error(e);
        status.textContent = 'No se pudo cargar el lector de códigos (revisa la conexión). Puedes escribir el ISBN a mano.';
        return;
      }
      if (finished) return;   // se canceló mientras cargaba

      let hints;
      try {
        hints = new Map();
        hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [
          ZXing.BarcodeFormat.EAN_13, ZXing.BarcodeFormat.EAN_8,
          ZXing.BarcodeFormat.UPC_A, ZXing.BarcodeFormat.UPC_E
        ]);
      } catch (e) { hints = undefined; }   // sin pistas, ZXing prueba todos los formatos

      zxingReader = new ZXing.BrowserMultiFormatReader(hints);
      status.textContent = 'Buscando el código…';
      zxingReader.decodeFromStream(stream, video, (result, error) => {
        if (result && result.getText && result.getText()) {
          status.textContent = '¡Código leído!';
          finish(String(result.getText()));
        }
        // Un error "no encontrado en este fotograma" llega en cada intento
        // fallido: es el funcionamiento normal mientras se busca el código,
        // no un fallo que haya que contar.
      }).catch(e => {
        if (finished) return;
        console.error('ZXing no pudo leer de la cámara', e);
        status.textContent = 'No se pudo leer desde la cámara. Puedes escribir el ISBN a mano.';
      });
    })();
  });
}

/** Bucle de detección con la API nativa del navegador. */
function iniciarConMotorNativo(detector, video, stream, status, finish, estaTerminado) {
  video.srcObject = stream;
  video.play().catch(() => { /* algunos navegadores ya la reproducen solos */ });
  status.textContent = 'Buscando el código…';

  // Analizamos unas 8 veces por segundo, no en cada fotograma. Encadenar
  // detecciones a 60 fps satura la CPU de una tablet, y de rebote entorpece
  // al propio enfoque automático de la cámara: sale más a cuenta mirar menos
  // veces y que cada mirada sea nítida.
  const tick = async () => {
    if (estaTerminado()) return;
    try {
      const codes = await detector.detect(video);
      if (codes && codes.length && codes[0].rawValue) {
        status.textContent = '¡Código leído!';
        finish(String(codes[0].rawValue));
        return;
      }
    } catch (e) {
      // detect() falla si el vídeo aún no tiene fotograma; se reintenta.
    }
    setTimeout(tick, 120);
  };
  setTimeout(tick, 120);
}
