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
// Efecto colateral bueno: al dejar de exigir BarcodeDetector para mostrar el
// botón, el escaneo también funciona en iPhone vía ZXing (Safari sí tiene
// getUserMedia, solo le falta la clase BarcodeDetector). La limitación de
// iOS que se documentó en el brief ha quedado desactualizada por este cambio.
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
 * código de barras — se detectó ese síntoma exacto en un Fire tablet real. El
 * acercamiento se hace después, por software, sobre un recorte ya nítido
 * (ver `recortarCentro`), que no depende de si el hardware sabe hacer zoom.
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
 * Recorta el centro del fotograma y lo amplía sobre un canvas reutilizable.
 *
 * El margen es deliberadamente generoso (90% del ancho, 60% del alto), no
 * ajustado al rectángulo guía visual. El vídeo en pantalla pasa por
 * `object-fit:cover`, que recorta los lados para encajarlo en el hueco — y
 * ese recorte depende de la proporción real que conceda la cámara, que varía
 * por dispositivo. Ajustar el recorte digital al recuadro exacto que se ve en
 * pantalla exigiría conocer esa proporción en cada caso; calcularlo mal deja
 * el código fuera de la zona que se analiza, que es peor que no recortar en
 * absoluto. Con un margen amplio se pierde algo de aumento, pero el código
 * casi seguro queda dentro pase lo que pase.
 */
function recortarCentro(video, canvas) {
  const vw = video.videoWidth, vh = video.videoHeight;
  if (!vw || !vh) return null;

  const cropX = vw * 0.05, cropW = vw * 0.90;
  const cropY = vh * 0.20, cropH = vh * 0.60;

  const destW = 1000;
  const destH = Math.round(destW * (cropH / cropW));
  if (canvas.width !== destW) canvas.width = destW;
  if (canvas.height !== destH) canvas.height = destH;

  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, destW, destH);
  return canvas;
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
      <p class="field-hint">Encuadra el código de barras dentro del recuadro, con buena luz. Se lee solo.</p>
      <div class="sheet-actions">
        <button class="btn-secondary" id="scanner-cancel">Cancelar</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const video = overlay.querySelector('#scanner-video');
  const status = overlay.querySelector('#scanner-status');
  const lienzo = document.createElement('canvas');   // se reutiliza en cada intento, no se recrea

  let stream = null;
  let tickId = null;
  let finished = false;

  const cleanup = () => {
    if (tickId) clearTimeout(tickId);
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

    /**
     * Bucle de detección común a los dos motores: recorta y amplía el centro
     * del fotograma y se lo pasa a `detectarUnaVez`, que cada motor implementa
     * a su manera (ver más abajo). Unificar el bucle evita mantener dos
     * copias casi idénticas de esta lógica.
     */
    const iniciarBucle = detectarUnaVez => {
      status.textContent = 'Buscando el código…';
      // Unas 8 veces por segundo, no en cada fotograma: encadenar detecciones
      // a 60 fps satura la CPU de una tablet y entorpece al propio enfoque
      // automático de la cámara.
      const tick = async () => {
        if (finished) return;
        const recorte = recortarCentro(video, lienzo);
        if (recorte) {
          try {
            const rawValue = await detectarUnaVez(recorte);
            if (rawValue) {
              status.textContent = '¡Código leído!';
              finish(rawValue);
              return;
            }
          } catch (e) {
            // Nada encontrado en este fotograma: es lo normal mientras se
            // busca, no un fallo que haya que contar.
          }
        }
        tickId = setTimeout(tick, 120);
      };
      tickId = setTimeout(tick, 120);
    };

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

      video.srcObject = stream;
      try { await video.play(); } catch (e) { /* algunos navegadores ya la reproducen solos */ }
      await ajustarCamara(stream, overlay);
      if (finished) return;   // se canceló mientras se preparaba la cámara

      if (detectorNativo) {
        iniciarBucle(async canvas => {
          const codes = await detectorNativo.detect(canvas);
          return (codes && codes.length && codes[0].rawValue) ? String(codes[0].rawValue) : null;
        });
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

      const zxingReader = new ZXing.BrowserMultiFormatReader(hints);
      // No se usa reader.decode(canvas): por dentro, ZXing solo sabe medir el
      // tamaño de un <video> o un <img> (mira si es `instanceof` cada uno);
      // un <canvas> normal no encaja en ninguno de los dos casos, así que su
      // lienzo interno se queda a tamaño cero y falla siempre, en silencio,
      // sin lanzar ningún error que lo delate. Se evita del todo pasando los
      // píxeles en bruto, que no dependen de qué tipo de elemento sea el origen.
      iniciarBucle(canvas => Promise.resolve().then(() => {
        const ctx = canvas.getContext('2d');
        const imagen = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const fuente = new ZXing.RGBLuminanceSource(imagen.data, canvas.width, canvas.height);
        const bitmap = new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(fuente));
        const resultado = zxingReader.decodeBitmap(bitmap);
        return resultado && resultado.getText ? String(resultado.getText()) : null;
      }));
    })();
  });
}
