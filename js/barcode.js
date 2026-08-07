// Escaneo del código de barras de un libro con la cámara.
//
// Usa BarcodeDetector, la API del propio navegador, sin librerías externas.
// Eso deja fuera el iPhone: Apple obliga a que todos los navegadores de iOS usen
// su motor WebKit, que no la implementa, así que Chrome en iPhone tampoco vale.
// Decisión tomada en el brief: basta con que funcione en Android y Fire, y a
// cambio nos ahorramos cargar un decodificador por CDN. Donde no hay soporte, el
// botón sencillamente no se ofrece.
//
// Requiere HTTPS. En GitHub Pages funciona; abriendo el fichero en local, no.

const FORMATOS_LIBRO = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];

/** ¿Puede este navegador escanear? Si no, no enseñamos el botón. */
export function barcodeAvailable() {
  return typeof window.BarcodeDetector === 'function'
    && window.isSecureContext
    && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

/**
 * Saca de la cámara lo mejor que sepa dar para leer un código de barras.
 *
 * Por defecto muchas cámaras arrancan con enfoque fijo o de un solo disparo, y
 * en primeros planos se quedan borrosas: es lo que obliga a bailar con el libro
 * hasta que engancha. Pedir enfoque continuo lo corrige donde esté disponible.
 * Todo esto es opcional en la especificación, así que se aplica lo que haya y se
 * ignora en silencio lo que no: nada de esto debe impedir escanear.
 */
async function ajustarCamara(stream, overlay) {
  const track = stream.getVideoTracks()[0];
  if (!track || typeof track.getCapabilities !== 'function') return;

  let caps = {};
  try { caps = track.getCapabilities() || {}; } catch (e) { return; }

  const avanzado = [];
  if (Array.isArray(caps.focusMode) && caps.focusMode.includes('continuous')) {
    avanzado.push({ focusMode: 'continuous' });
  }
  // Un poco de zoom óptico ayuda: llena el encuadre con el código sin tener que
  // acercar tanto el libro como para que la cámara ya no enfoque.
  if (caps.zoom && caps.zoom.min != null && caps.zoom.max != null) {
    const zoom = Math.min(caps.zoom.max, Math.max(caps.zoom.min, 1.5));
    avanzado.push({ zoom });
  }
  if (avanzado.length) {
    try { await track.applyConstraints({ advanced: avanzado }); } catch (e) { /* opcional */ }
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
      <p class="field-hint">Apunta al código de barras de la contraportada, a unos 15&nbsp;cm y con buena luz. Se lee solo.</p>
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
  let finished = false;

  const cleanup = () => {
    if (rafId) clearTimeout(rafId);
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
      let detector;
      try {
        // Pedimos solo los formatos que soporte el navegador: pasar uno
        // desconocido hace fallar el constructor entero.
        const soportados = await window.BarcodeDetector.getSupportedFormats();
        const formats = FORMATOS_LIBRO.filter(f => soportados.includes(f));
        if (!formats.length) {
          status.textContent = 'Este navegador no sabe leer códigos de barras de libros.';
          return;
        }
        detector = new window.BarcodeDetector({ formats });
      } catch (e) {
        console.error('No se pudo preparar el lector', e);
        status.textContent = 'No se pudo preparar el lector de códigos.';
        return;
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },   // cámara trasera
            // Un código de barras es un patrón fino: con la resolución por
            // defecto (a menudo 640x480) las barras se emborronan y hay que
            // acercarse mucho. Pidiendo más píxeles se lee desde más lejos.
            width: { ideal: 1920 },
            height: { ideal: 1080 }
          }
        });
      } catch (e) {
        console.error('Cámara no disponible', e);
        status.textContent = e && e.name === 'NotAllowedError'
          ? 'No has dado permiso para usar la cámara. Puedes escribir el ISBN a mano.'
          : 'No se pudo abrir la cámara. Puedes escribir el ISBN a mano.';
        return;
      }

      video.srcObject = stream;
      try { await video.play(); } catch (e) { /* algunos navegadores ya la reproducen solos */ }

      await ajustarCamara(stream, overlay);
      status.textContent = 'Buscando el código…';

      // Analizamos unas 8 veces por segundo, no en cada fotograma. Encadenar
      // detecciones a 60 fps satura la CPU de una tablet, y de rebote entorpece
      // al propio enfoque automático de la cámara: sale más a cuenta mirar
      // menos veces y que cada mirada sea nítida.
      const tick = async () => {
        if (finished) return;
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
        rafId = setTimeout(tick, 120);
      };
      rafId = setTimeout(tick, 120);
    })();
  });
}
