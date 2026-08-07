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
      <p class="field-hint">Apunta al código de barras de la contraportada. Se lee solo.</p>
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
    if (rafId) cancelAnimationFrame(rafId);
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
          video: { facingMode: { ideal: 'environment' } }   // cámara trasera
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
      status.textContent = 'Buscando el código…';

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
        rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);
    })();
  });
}
