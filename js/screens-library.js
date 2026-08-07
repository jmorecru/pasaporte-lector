// La biblioteca de un niño: sus libros, los filtros y el formulario de añadir.
// Es la pantalla que ve el niño una vez ha acertado su código.
//
// Las colecciones y las etiquetas se escriben a mano: la API de Google Books no
// devuelve ningún campo de saga o colección (`categories` son géneros del sector
// editorial, tipo "Juvenile Fiction", no sirven). Para que "Harry Potter" y
// "harry potter" no acaben siendo dos colecciones distintas, se agrupan y se
// comparan en minúsculas, pero se muestra el texto tal como se escribió.

import * as store from './store.js';
import { googleBooksApiKey } from './firebase-config.js';
import {
  escapeHtml, todayISO, formatDate, describeError, stripTags,
  looksLikeIsbn, normalizeIsbn, formatMinutes, formatChrono
} from './util.js';
import { barcodeAvailable, scanBarcode } from './barcode.js';
import { ambiente, SONIDOS } from './ambient.js';

const STATUS_LABELS = { pendiente: 'Pendiente', leyendo: 'Leyendo', terminado: 'Terminado' };
const SIN_COLECCION = '__sin-coleccion__';   // valor imposible de teclear

export class LibraryScreen {
  /**
   * @param {HTMLElement} root  contenedor donde pintar
   * @param {string} familyId
   * @param {object} child      { id, name, color }
   * @param {{onExit: () => void}} handlers
   */
  constructor(root, familyId, child, { onExit }) {
    this.root = root;
    this.familyId = familyId;
    this.child = child;
    this.onExit = onExit;

    this.books = [];
    this.filter = 'todos';
    this.collectionFilter = null;   // null = todas; SIN_COLECCION = las sueltas
    this.tagFilter = null;
    this.loading = true;
    this.syncError = null;
    this.freshlyFinishedId = null;
    this.selectedBookResult = null;
    this.searchDebounce = null;
    this.unsubscribe = null;
    this.unsubSessions = null;
    this.chronoTimer = null;
  }

  mount() {
    this.render();
    this.unsubscribe = store.subscribeBooks(
      this.familyId,
      this.child.id,
      books => {
        this.books = books;
        this.loading = false;
        this.syncError = null;
        this.pruneFilters();
        this.render();
      },
      err => {
        this.loading = false;
        this.syncError = describeError(err);
        this.render();
      }
    );
  }

  destroy() {
    if (this.unsubscribe) { this.unsubscribe(); this.unsubscribe = null; }
    if (this.unsubSessions) { this.unsubSessions(); this.unsubSessions = null; }
    clearTimeout(this.searchDebounce);
    clearInterval(this.chronoTimer);
    // Al salir del pasaporte se calla: el sonido acompaña a la lectura, y
    // seguir sonando en la pantalla de "¿Quién eres?" sería desconcertante.
    ambiente.parar();
  }

  // ---- Colecciones y etiquetas ----

  /** Colecciones presentes, sin repetir. Devuelve [{key, label}] ordenado. */
  collections() {
    const found = new Map();
    this.books.forEach(b => {
      const name = (b.collection || '').trim();
      if (name && !found.has(name.toLowerCase())) found.set(name.toLowerCase(), name);
    });
    return [...found.entries()]
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'es'));
  }

  /** Etiquetas presentes, sin repetir. */
  tags() {
    const found = new Map();
    this.books.forEach(b => {
      (b.tags || []).forEach(t => {
        const name = String(t).trim();
        if (name && !found.has(name.toLowerCase())) found.set(name.toLowerCase(), name);
      });
    });
    return [...found.entries()]
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'es'));
  }

  /** Si el último libro de una colección o etiqueta desaparece, suelta su filtro. */
  pruneFilters() {
    if (this.collectionFilter && this.collectionFilter !== SIN_COLECCION) {
      if (!this.collections().some(c => c.key === this.collectionFilter)) this.collectionFilter = null;
    }
    if (this.tagFilter && !this.tags().some(t => t.key === this.tagFilter)) this.tagFilter = null;
  }

  visibleBooks() {
    return this.books.filter(b => {
      if (this.filter !== 'todos' && b.status !== this.filter) return false;
      if (this.collectionFilter) {
        const name = (b.collection || '').trim().toLowerCase();
        if (this.collectionFilter === SIN_COLECCION ? name !== '' : name !== this.collectionFilter) return false;
      }
      if (this.tagFilter) {
        const has = (b.tags || []).some(t => String(t).trim().toLowerCase() === this.tagFilter);
        if (!has) return false;
      }
      return true;
    });
  }

  // ---- Pintado ----

  render() {
    const filtered = this.visibleBooks();
    const finished = this.books.filter(b => b.status === 'terminado').length;
    const collections = this.collections();
    const tags = this.tags();
    const someLoose = this.books.some(b => !(b.collection || '').trim());

    this.root.className = '';
    this.root.innerHTML = `
      ${this.syncError ? `<div class="sync-banner visible">⚠ Sin sincronizar: ${escapeHtml(this.syncError)}</div>` : ''}
      <div class="screen-bar">
        <button class="link-btn" id="btn-exit">‹ Cambiar de lector</button>
        <button class="link-btn ${ambiente.sonando ? 'sounding' : ''}" id="btn-sound">
          ${ambiente.sonando ? '🔊 Sonido' : '🎵 Sonido'}
        </button>
      </div>
      <div class="panel">
        <div class="child-heading">
          <h2 style="color:${escapeHtml(this.child.color || 'inherit')};">${escapeHtml(this.child.name)}</h2>
          <span class="stamp-count">🏅 ${finished} libro${finished === 1 ? '' : 's'} terminado${finished === 1 ? '' : 's'}</span>
        </div>

        <div class="filters">
          ${this.filterBtn('todos', 'Todos')}
          ${this.filterBtn('leyendo', 'Leyendo')}
          ${this.filterBtn('terminado', 'Terminados')}
          ${this.filterBtn('pendiente', 'Pendientes')}
        </div>

        ${collections.length ? `
          <div class="filters-secondary">
            <label class="inline-label" for="collection-filter">Colección</label>
            <select id="collection-filter">
              <option value="">Todas</option>
              ${collections.map(c => `
                <option value="${escapeHtml(c.key)}" ${this.collectionFilter === c.key ? 'selected' : ''}>
                  ${escapeHtml(c.label)}
                </option>`).join('')}
              ${someLoose ? `<option value="${SIN_COLECCION}" ${this.collectionFilter === SIN_COLECCION ? 'selected' : ''}>Sin colección</option>` : ''}
            </select>
          </div>` : ''}

        ${tags.length ? `
          <div class="tag-filters">
            ${tags.map(t => `
              <button class="tag-chip ${this.tagFilter === t.key ? 'active' : ''}" data-tag="${escapeHtml(t.key)}">
                ${escapeHtml(t.label)}
              </button>`).join('')}
          </div>` : ''}

        <button class="btn-primary" id="btn-add-book">+ Añadir libro</button>

        <div class="book-list">
          ${this.loading
            ? `<div class="empty-state"><p>Cargando libros…</p></div>`
            : filtered.length
              ? filtered.map(b => this.bookCard(b)).join('')
              : `<div class="empty-state">
                   <span class="big">📗</span>
                   <p>${this.books.length ? 'No hay libros con estos filtros.' : 'Todavía no hay libros aquí. ¡Añade el primero!'}</p>
                 </div>`}
        </div>
      </div>
    `;
    this.bindEvents();
  }

  filterBtn(key, label) {
    return `<button class="filter-btn ${this.filter === key ? 'active' : ''}" data-filter="${key}">${label}</button>`;
  }

  bookCard(b) {
    const stars = b.rating ? '★'.repeat(b.rating) + '☆'.repeat(5 - b.rating) : '';
    const isFresh = b.id === this.freshlyFinishedId;
    const finished = b.finishedAt ? formatDate(b.finishedAt) : '';
    const collection = (b.collection || '').trim();
    const tags = (b.tags || []).filter(t => String(t).trim());
    return `
      <div class="book-card estado-${b.status}">
        ${b.status === 'terminado' ? `<div class="stamp ${isFresh ? 'fresh' : ''}">LEÍDO${finished ? ' · ' + finished : ''}</div>` : ''}
        <div class="book-top">
          ${b.cover ? `<img class="book-cover" src="${escapeHtml(b.cover)}" alt="">` : ''}
          <div>
            ${collection ? `<p class="book-collection">📚 ${escapeHtml(collection)}</p>` : ''}
            <p class="book-title">${escapeHtml(b.title)}</p>
            ${b.author ? `<p class="book-author">${escapeHtml(b.author)}</p>` : ''}
          </div>
        </div>
        <div class="book-meta">
          <span class="badge ${b.status}">${STATUS_LABELS[b.status]}</span>
          ${b.reserved ? `<span class="badge reservado">🏛 Reservado</span>` : ''}
          ${stars ? `<span class="stars">${stars}</span>` : ''}
          ${b.pages ? `<span class="book-pages">${b.pages} páginas</span>` : ''}
        </div>
        ${this.readingBlock(b)}
        ${tags.length ? `<div class="book-tags">${tags.map(t => `<span class="tag-chip static">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
        ${b.description ? `<details class="synopsis"><summary>Sinopsis</summary><p>${escapeHtml(b.description)}</p></details>` : ''}
        ${b.notes ? `<p class="book-notes">"${escapeHtml(b.notes)}"</p>` : ''}
        <div class="book-actions">
          ${b.status !== 'leyendo' ? `<button class="icon-btn" data-action="set-status" data-id="${b.id}" data-status="leyendo">▶ Marcar leyendo</button>` : ''}
          ${b.status !== 'terminado' ? `<button class="icon-btn" data-action="set-status" data-id="${b.id}" data-status="terminado">✔ Marcar terminado</button>` : ''}
          ${b.status !== 'pendiente' ? `<button class="icon-btn" data-action="set-status" data-id="${b.id}" data-status="pendiente">⏸ Pendiente</button>` : ''}
          ${b.status !== 'terminado' ? (b.reserved
            ? `<button class="icon-btn" data-action="unreserve" data-id="${b.id}">✖ Ya no lo quiero</button>`
            : `<button class="icon-btn" data-action="reserve" data-id="${b.id}">🏛 Pedir a la biblioteca</button>`) : ''}
          <button class="icon-btn" data-action="edit-book" data-id="${b.id}">✏ Editar</button>
          <button class="icon-btn danger" data-action="delete-book" data-id="${b.id}">🗑 Borrar</button>
        </div>
      </div>
    `;
  }

  /** Cronómetro, marcapáginas y minutos acumulados de un libro. */
  readingBlock(b) {
    const partes = [];
    if (b.activeSince) {
      partes.push(`<span class="chrono" data-chrono="${b.id}">${escapeHtml(formatChrono(Date.now() - b.activeSince))}</span>`);
      partes.push(`<button class="icon-btn stop" data-action="stop-session" data-id="${b.id}">⏹ Terminar sesión</button>`);
    } else if (b.status !== 'terminado') {
      partes.push(`<button class="icon-btn" data-action="start-session" data-id="${b.id}">⏱ Empezar a leer</button>`);
    }
    if (b.currentPage) {
      partes.push(`<span class="bookmark">🔖 vas por la página ${b.currentPage}</span>`);
    }
    if (b.totalMinutes) {
      partes.push(`<span class="read-total">⏳ ${escapeHtml(formatMinutes(b.totalMinutes))}</span>`);
    }
    if (b.sessionCount) {
      partes.push(`<button class="icon-btn" data-action="sessions" data-id="${b.id}">🕘 ${b.sessionCount} sesión${b.sessionCount === 1 ? '' : 'es'}</button>`);
    }
    return partes.length ? `<div class="reading-block">${partes.join('')}</div>` : '';
  }

  /**
   * Refresca los cronómetros en marcha cada segundo tocando solo su texto.
   * Volver a pintar la pantalla entera cerraría las sinopsis desplegadas y
   * daría un parpadeo cada segundo.
   */
  startChronoTicking() {
    clearInterval(this.chronoTimer);
    const activos = this.books.filter(b => b.activeSince);
    if (!activos.length) return;
    const tick = () => {
      activos.forEach(b => {
        const el = this.root.querySelector(`[data-chrono="${b.id}"]`);
        if (el) el.textContent = formatChrono(Date.now() - b.activeSince);
      });
    };
    tick();
    this.chronoTimer = setInterval(tick, 1000);
  }

  /** Elegir sonido ambiente. Arranca desde la pulsación: los móviles no dejan sonar nada sin un gesto. */
  openSoundSheet() {
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.innerHTML = `
      <div class="sheet">
        <h3>Sonido para leer</h3>
        <p class="field-hint">Se genera en el momento, no se descarga nada.</p>
        <div class="sound-grid">
          ${SONIDOS.map(s => `
            <button class="sound-card ${ambiente.sonando === s.id ? 'active' : ''}" data-sound="${s.id}">
              <span class="sound-emoji">${s.emoji}</span>
              <span>${escapeHtml(s.etiqueta)}</span>
            </button>`).join('')}
          <button class="sound-card ${!ambiente.sonando ? 'active' : ''}" data-sound="">
            <span class="sound-emoji">🔇</span>
            <span>Silencio</span>
          </button>
        </div>

        <label for="sound-volume">Volumen</label>
        <input type="range" id="sound-volume" min="0" max="100" value="${Math.round(ambiente.volumen * 100)}">

        <p class="field-hint">Puede pararse si bloqueas la pantalla: el navegador apaga el sonido cuando la página deja de verse.</p>
        <div class="sheet-actions">
          <button class="btn-secondary" id="close-sound">Cerrar</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const cerrar = () => { overlay.remove(); this.render(); };
    overlay.querySelector('#close-sound').onclick = cerrar;
    overlay.addEventListener('click', e => { if (e.target === overlay) cerrar(); });

    overlay.querySelector('#sound-volume').oninput = e => {
      ambiente.setVolumen(Number(e.target.value) / 100);
    };

    overlay.querySelectorAll('[data-sound]').forEach(btn => {
      btn.onclick = async () => {
        const id = btn.dataset.sound;
        if (!id) ambiente.parar();
        else await ambiente.reproducir(id);
        overlay.querySelectorAll('.sound-card').forEach(c => {
          c.classList.toggle('active', c.dataset.sound === (ambiente.sonando || ''));
        });
      };
    });
  }

  bindEvents() {
    this.root.querySelector('#btn-exit').onclick = () => this.onExit();
    this.root.querySelector('#btn-sound').onclick = () => this.openSoundSheet();
    this.root.querySelector('#btn-add-book').onclick = () => this.openBookSheet(null);

    this.root.querySelectorAll('.filter-btn').forEach(btn => {
      btn.onclick = () => { this.filter = btn.dataset.filter; this.render(); };
    });

    const collectionSelect = this.root.querySelector('#collection-filter');
    if (collectionSelect) {
      collectionSelect.onchange = () => {
        this.collectionFilter = collectionSelect.value || null;
        this.render();
      };
    }

    this.root.querySelectorAll('.tag-chip[data-tag]').forEach(chip => {
      chip.onclick = () => {
        this.tagFilter = this.tagFilter === chip.dataset.tag ? null : chip.dataset.tag;
        this.render();
      };
    });

    this.root.querySelectorAll('[data-action="set-status"]').forEach(btn => {
      btn.onclick = () => this.setStatus(btn.dataset.id, btn.dataset.status);
    });
    this.root.querySelectorAll('[data-action="edit-book"]').forEach(btn => {
      btn.onclick = () => {
        const book = this.books.find(b => b.id === btn.dataset.id);
        if (book) this.openBookSheet(book);
      };
    });
    this.root.querySelectorAll('[data-action="delete-book"]').forEach(btn => {
      btn.onclick = () => this.deleteBook(btn.dataset.id);
    });
    this.root.querySelectorAll('[data-action="start-session"]').forEach(btn => {
      btn.onclick = () => this.startSession(btn.dataset.id);
    });
    this.root.querySelectorAll('[data-action="stop-session"]').forEach(btn => {
      btn.onclick = () => this.openEndSessionSheet(btn.dataset.id);
    });
    this.root.querySelectorAll('[data-action="sessions"]').forEach(btn => {
      btn.onclick = () => this.openSessionsSheet(btn.dataset.id);
    });
    this.root.querySelectorAll('[data-action="reserve"]').forEach(btn => {
      btn.onclick = () => this.setReserved(btn.dataset.id, true);
    });
    this.root.querySelectorAll('[data-action="unreserve"]').forEach(btn => {
      btn.onclick = () => this.setReserved(btn.dataset.id, false);
    });

    this.startChronoTicking();
  }

  // ---- Escrituras ----
  // No hace falta re-renderizar a mano: onSnapshot dispara al instante con el
  // cambio local, antes incluso de que el servidor confirme.

  async setStatus(bookId, status) {
    const changes = { status, finishedAt: status === 'terminado' ? todayISO() : null };
    if (status === 'terminado') {
      this.freshlyFinishedId = bookId;
      setTimeout(() => { this.freshlyFinishedId = null; }, 700);
    } else if (this.freshlyFinishedId === bookId) {
      this.freshlyFinishedId = null;
    }
    try {
      await store.updateBook(this.familyId, this.child.id, bookId, changes);
    } catch (e) {
      this.reportError('No se pudo cambiar el estado del libro.', e);
    }
  }

  async deleteBook(bookId) {
    try {
      await store.deleteBook(this.familyId, this.child.id, bookId);
    } catch (e) {
      this.reportError('No se pudo borrar el libro.', e);
    }
  }

  reportError(message, err) {
    console.error(message, err);
    this.syncError = message;
    this.render();
  }

  /**
   * Pide (o retira la petición de) que un adulto reserve el libro en la
   * biblioteca. Es una marca aparte, no un estado de lectura: un libro pedido
   * sigue estando pendiente, y cuando el adulto lo consigue solo se borra la
   * marca, sin tocar por dónde iba la lectura.
   */
  async setReserved(bookId, reserved) {
    try {
      await store.updateBook(this.familyId, this.child.id, bookId, {
        reserved,
        reservedAt: reserved ? Date.now() : null
      });
    } catch (e) {
      this.reportError('No se pudo enviar la petición.', e);
    }
  }

  // ---- Sesiones de lectura ----

  /**
   * Arranca el cronómetro guardando la marca de inicio en el libro.
   *
   * Se guarda el instante, no un contador que vaya sumando: si el niño bloquea
   * la tablet o se va a otra app, un contador en JavaScript se congela y el
   * tiempo saldría corto. Con la marca de inicio da igual lo que pase por medio,
   * e incluso sobrevive a cerrar la app o recargar.
   */
  async startSession(bookId) {
    const book = this.books.find(b => b.id === bookId);
    if (!book || book.activeSince) return;
    const changes = { activeSince: Date.now() };
    // Si estaba en la lista de pendientes, empezar a leerlo es empezar a leerlo.
    if (book.status === 'pendiente') changes.status = 'leyendo';
    try {
      await store.updateBook(this.familyId, this.child.id, bookId, changes);
    } catch (e) {
      this.reportError('No se pudo arrancar el temporizador.', e);
    }
  }

  openEndSessionSheet(bookId) {
    const book = this.books.find(b => b.id === bookId);
    if (!book || !book.activeSince) return;

    const startedAt = book.activeSince;
    const transcurridoMs = Date.now() - startedAt;
    const minutos = Math.max(1, Math.round(transcurridoMs / 60000));
    // Cuatro horas seguidas es más probable que sea un cronómetro olvidado que
    // una sesión real, así que avisamos en vez de sumarlo callando.
    const sospechoso = transcurridoMs > 4 * 60 * 60 * 1000;
    const desde = book.currentPage ? book.currentPage + 1 : 1;

    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.innerHTML = `
      <div class="sheet">
        <h3>Fin de la sesión</h3>
        <p class="chrono-final">${escapeHtml(formatChrono(transcurridoMs))}</p>
        ${sospechoso ? `<p class="form-error">Han pasado más de 4 horas. ¿Te dejaste el temporizador puesto? Corrige los minutos si hace falta.</p>` : ''}

        <label for="session-minutes">Minutos leídos</label>
        <input type="number" id="session-minutes" min="1" max="1440" value="${minutos}">
        <p class="field-hint">Sale del cronómetro, pero puedes ajustarlo.</p>

        <label for="session-from">De la página</label>
        <input type="number" id="session-from" min="1" max="20000" value="${desde}">

        <label for="session-to">A la página</label>
        <input type="number" id="session-to" min="1" max="20000" placeholder="¿Por dónde te has quedado?">
        <p class="field-hint">Esta será tu marca para la próxima vez. Puedes dejarlo en blanco si no lo sabes.</p>

        <label class="check-row">
          <input type="checkbox" id="session-finished">
          <span>Lo he terminado</span>
        </label>

        <p class="form-error" id="session-error"></p>
        <div class="sheet-actions">
          <button class="btn-secondary" id="discard-session">Descartar</button>
          <button class="btn-confirm" id="save-session">Guardar sesión</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    const error = overlay.querySelector('#session-error');
    const pageTo = overlay.querySelector('#session-to');
    const finished = overlay.querySelector('#session-finished');

    // Nada se decide por el número de páginas: es solo informativo. El dato que
    // devuelve Google Books no es de fiar (las ediciones ilustradas o poco
    // catalogadas dan 0 o cifras raras), y además cambiar una casilla sola,
    // mientras el teclado la tapa, es justo lo que no debe hacer un formulario.
    // Marcar un libro como terminado es siempre una decisión explícita.

    overlay.querySelector('#discard-session').onclick = async () => {
      overlay.remove();
      try {
        await store.updateBook(this.familyId, this.child.id, bookId, { activeSince: null });
      } catch (e) {
        this.reportError('No se pudo descartar la sesión.', e);
      }
    };

    const guardar = overlay.querySelector('#save-session');
    guardar.onclick = async () => {
      const min = parseInt(overlay.querySelector('#session-minutes').value, 10);
      if (!Number.isFinite(min) || min < 1) { error.textContent = 'Pon cuántos minutos has leído.'; return; }
      const from = parseInt(overlay.querySelector('#session-from').value, 10);
      const to = parseInt(pageTo.value, 10);
      if (Number.isFinite(from) && Number.isFinite(to) && to < from) {
        error.textContent = 'La página final es anterior a la inicial.';
        return;
      }

      const session = {
        startedAt,
        endedAt: Date.now(),
        minutes: min,
        pageFrom: Number.isFinite(from) ? from : null,
        pageTo: Number.isFinite(to) ? to : null,
        day: todayISO()      // para poder agrupar por día sin recalcular fechas
      };
      const bookChanges = {
        activeSince: null,
        totalMinutes: (book.totalMinutes || 0) + min,
        sessionCount: (book.sessionCount || 0) + 1
      };
      if (Number.isFinite(to)) bookChanges.currentPage = to;
      if (finished.checked) {
        bookChanges.status = 'terminado';
        bookChanges.finishedAt = todayISO();
      }

      guardar.disabled = true;
      try {
        await store.endSession(this.familyId, this.child.id, bookId, session, bookChanges);
        if (finished.checked) {
          this.freshlyFinishedId = bookId;
          setTimeout(() => { this.freshlyFinishedId = null; }, 700);
        }
        overlay.remove();
      } catch (e) {
        console.error(e);
        error.textContent = describeError(e);
        guardar.disabled = false;
      }
    };
  }

  /** Historial de sesiones de un libro, con opción de borrar las erróneas. */
  openSessionsSheet(bookId) {
    const book = this.books.find(b => b.id === bookId);
    if (!book) return;

    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.innerHTML = `
      <div class="sheet">
        <h3>Sesiones de "${escapeHtml(book.title)}"</h3>
        <p class="field-hint">${escapeHtml(formatMinutes(book.totalMinutes || 0))} en total.</p>
        <div id="sessions-list"><p class="field-hint">Cargando…</p></div>
        <div class="sheet-actions">
          <button class="btn-secondary" id="close-sessions">Cerrar</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const lista = overlay.querySelector('#sessions-list');
    const cerrar = () => {
      if (this.unsubSessions) { this.unsubSessions(); this.unsubSessions = null; }
      overlay.remove();
    };
    overlay.querySelector('#close-sessions').onclick = cerrar;
    overlay.addEventListener('click', e => { if (e.target === overlay) cerrar(); });

    // Solo nos suscribimos mientras la hoja está abierta: escuchar las sesiones
    // de todos los libros a la vez sería un derroche para lo poco que se miran.
    this.unsubSessions = store.subscribeSessions(
      this.familyId, this.child.id, bookId,
      sessions => {
        if (!sessions.length) {
          lista.innerHTML = '<p class="field-hint">Todavía no hay sesiones guardadas.</p>';
          return;
        }
        lista.innerHTML = sessions.map(s => `
          <div class="session-row">
            <div class="admin-row-main">
              <p class="admin-row-title">${escapeHtml(formatMinutes(s.minutes))}</p>
              <p class="admin-row-sub">${escapeHtml(formatDate(s.day || ''))}${
                s.pageFrom && s.pageTo ? ` · págs. ${s.pageFrom}–${s.pageTo}` : ''
              }</p>
            </div>
            <button class="icon-btn danger" data-session="${s.id}" data-min="${s.minutes}">Borrar</button>
          </div>
        `).join('');

        lista.querySelectorAll('[data-session]').forEach(btn => {
          btn.onclick = async () => {
            btn.disabled = true;
            const min = parseInt(btn.dataset.min, 10) || 0;
            const actual = this.books.find(b => b.id === bookId) || book;
            try {
              await store.deleteSession(this.familyId, this.child.id, bookId, btn.dataset.session, {
                totalMinutes: Math.max(0, (actual.totalMinutes || 0) - min),
                sessionCount: Math.max(0, (actual.sessionCount || 0) - 1)
              });
            } catch (e) {
              console.error(e);
              btn.disabled = false;
            }
          };
        });
      },
      () => { lista.innerHTML = '<p class="form-error">No se pudieron cargar las sesiones.</p>'; }
    );
  }

  // ---- Buscador de Google Books ----

  async searchBooks(queryText, resultsEl) {
    if (!queryText || queryText.length < 3) { resultsEl.innerHTML = ''; return; }

    // Si lo tecleado es un ISBN, se busca por ISBN: da el libro exacto en vez de
    // tratar el número como si fuera parte del título.
    let q = queryText;
    let porIsbn = false;
    if (looksLikeIsbn(queryText)) {
      const isbn = normalizeIsbn(queryText);
      if (!isbn) {
        resultsEl.innerHTML = '<p class="search-hint">Ese ISBN no es válido: repasa si falta o sobra algún número. También puedes buscar por el título.</p>';
        return;
      }
      q = `isbn:${isbn}`;
      porIsbn = true;
    }

    const key = googleBooksApiKey ? `&key=${encodeURIComponent(googleBooksApiKey)}` : '';
    const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=5${key}`;
    resultsEl.innerHTML = `<p class="search-hint">Buscando${porIsbn ? ' por ISBN' : ''}…</p>`;
    try {
      const res = await fetch(url);
      const json = await res.json().catch(() => null);
      // Sin este control, una respuesta de error de la API (cuota agotada,
      // bloqueo del proxy…) llegaría sin `items` y se confundiría con "este
      // libro no existe", que es un diagnóstico muy distinto.
      if (!res.ok) {
        console.error('Google Books respondió con error:', res.status, json);
        if (res.status === 429) {
          resultsEl.innerHTML = `<p class="search-hint">${googleBooksApiKey
            ? 'Se ha agotado la cuota diaria de búsquedas. Vuelve a intentarlo mañana o escribe los datos a mano.'
            : 'La cuota compartida de búsquedas está agotada. Configura una clave propia de Google Books (ver SETUP_FIREBASE.md) o escribe los datos a mano.'}</p>`;
          return;
        }
        const reason = (json && json.error && json.error.message) || `HTTP ${res.status}`;
        resultsEl.innerHTML = `<p class="search-hint">El buscador no está disponible ahora (${escapeHtml(reason)}). Escribe los datos a mano.</p>`;
        return;
      }
      const items = (json && json.items) || [];
      if (!items.length) {
        resultsEl.innerHTML = porIsbn
          ? '<p class="search-hint">Ese ISBN es correcto, pero Google Books no tiene ese libro. Prueba por el título, o escribe los datos a mano.</p>'
          : '<p class="search-hint">Sin resultados. Puedes escribir los datos a mano.</p>';
        return;
      }

      // Un ISBN identifica un libro concreto: si solo hay un resultado, elegirlo
      // ya es la respuesta. Obligar a tocarlo después de escanear era un paso
      // que nadie espera, y quien no lo daba se encontraba con "falta el título".
      if (porIsbn && items.length === 1) {
        resultsEl.innerHTML = '';
        this.applyBookResult(items[0].volumeInfo || {});
        return;
      }
      resultsEl.innerHTML = items.map((item, i) => {
        const info = item.volumeInfo || {};
        const cover = coverOf(info);
        const synopsis = stripTags(info.description);
        return `<div class="search-result" data-idx="${i}">
          <div class="sr-row">
            ${cover ? `<img class="book-cover" src="${escapeHtml(cover)}" alt="">` : `<div class="book-cover"></div>`}
            <div class="sr-info">
              <p class="sr-title">${escapeHtml(info.title || 'Sin título')}</p>
              <p class="sr-author">${escapeHtml((info.authors || []).join(', '))}</p>
              ${info.pageCount ? `<p class="sr-author">${info.pageCount} páginas</p>` : ''}
            </div>
          </div>
          ${synopsis
            ? `<details class="synopsis"><summary>Ver sinopsis</summary><p>${escapeHtml(synopsis)}</p></details>`
            : `<p class="search-hint">Sin sinopsis disponible.</p>`}
        </div>`;
      }).join('');

      // La sinopsis se abre y se cierra sin elegir el libro: si no paramos el
      // evento aquí, el clic llegaría a la tarjeta y lo seleccionaría.
      resultsEl.querySelectorAll('details.synopsis').forEach(d => {
        d.addEventListener('click', e => e.stopPropagation());
      });

      resultsEl.querySelectorAll('.search-result').forEach(el => {
        el.onclick = () => this.applyBookResult(items[parseInt(el.dataset.idx, 10)].volumeInfo || {});
      });
    } catch (e) {
      console.error('No se pudo contactar con Google Books', url, e);
      resultsEl.innerHTML = '<p class="search-hint">No se pudo conectar con el buscador (¿red, proxy o antivirus?). Escribe los datos a mano.</p>';
    }
  }

  /**
   * Vuelca un resultado de Google Books en el formulario.
   *
   * Los campos del formulario son la única fuente de verdad al guardar. Antes
   * convivían con los datos del buscador y estos ganaban, así que si alguien
   * elegía un libro y luego corregía el título, la corrección se perdía.
   */
  applyBookResult(info) {
    this.selectedBookResult = {
      title: info.title || '',
      author: (info.authors || []).join(', '),
      pages: info.pageCount || null,
      cover: coverOf(info),
      description: stripTags(info.description) || null
    };
    const set = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.value = value == null ? '' : value;
    };
    set('book-title', this.selectedBookResult.title);
    set('book-author', this.selectedBookResult.author);
    set('book-pages', this.selectedBookResult.pages);
    set('book-synopsis', this.selectedBookResult.description);
    this.renderSelectedBook();
  }

  renderSelectedBook() {
    const box = document.getElementById('selected-book-box');
    const searchWrap = document.getElementById('book-search-wrap');
    if (!box || !searchWrap) return;
    const sel = this.selectedBookResult;
    if (!sel) { box.innerHTML = ''; searchWrap.style.display = ''; return; }
    searchWrap.style.display = 'none';
    box.innerHTML = `
      <div class="selected-book">
        ${sel.cover ? `<img class="book-cover" src="${escapeHtml(sel.cover)}" alt="">` : `<div class="book-cover"></div>`}
        <div class="sr-info">
          <p class="sr-title">${escapeHtml(sel.title)}</p>
          <p class="sr-author">${escapeHtml(sel.author)}</p>
        </div>
        <button class="clear-selection" id="clear-selected-book">Cambiar</button>
      </div>
      ${sel.description
        ? `<details class="synopsis"><summary>Ver sinopsis</summary><p>${escapeHtml(sel.description)}</p></details>`
        : ''}
    `;
    document.getElementById('clear-selected-book').onclick = () => {
      this.selectedBookResult = null;
      this.renderSelectedBook();
    };
  }

  // ---- Formulario de añadir y editar ----

  /** @param {object|null} book  null para añadir uno nuevo */
  openBookSheet(book) {
    const isNew = !book;
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    let rating = book ? (book.rating || 0) : 0;
    this.selectedBookResult = null;

    // Al editar no ofrecemos el buscador: el libro ya está elegido y volver a
    // buscarlo solo serviría para pisar los datos que se quieren corregir.
    overlay.innerHTML = `
      <div class="sheet">
        <h3>${isNew ? 'Añadir libro' : 'Editar libro'}</h3>
        ${isNew ? `
          <div id="book-search-wrap">
            <label for="book-search">Busca el libro</label>
            <div class="search-row">
              <input type="text" id="book-search" placeholder="Título, autor o ISBN…">
              ${barcodeAvailable() ? `<button type="button" class="btn-scan" id="btn-scan" title="Escanear código de barras">📷</button>` : ''}
            </div>
            <div class="search-results" id="book-search-results"></div>
            <p class="search-hint">${barcodeAvailable()
              ? 'Con 📷 puedes escanear el código de barras de la contraportada.'
              : 'También puedes teclear el ISBN de la contraportada.'} Si no lo encuentras, escribe los datos abajo a mano.</p>
          </div>
          <div id="selected-book-box"></div>` : ''}

        <label for="book-title">Título</label>
        <input type="text" id="book-title" placeholder="Ej. El Principito" maxlength="120"
               value="${escapeHtml(book ? book.title : '')}">

        <label for="book-author">Autor (opcional)</label>
        <input type="text" id="book-author" maxlength="80" value="${escapeHtml(book ? (book.author || '') : '')}">

        <label for="book-collection">Colección (opcional)</label>
        <input type="text" id="book-collection" maxlength="60" list="collection-options"
               placeholder="Ej. Harry Potter" value="${escapeHtml(book ? (book.collection || '') : '')}">
        <datalist id="collection-options">
          ${this.collections().map(c => `<option value="${escapeHtml(c.label)}"></option>`).join('')}
        </datalist>
        <p class="field-hint">Para agrupar los libros de una misma saga. Se escribe a mano:
        Google Books no dice a qué colección pertenece cada libro.</p>

        <label for="book-tags">Etiquetas (opcional)</label>
        <input type="text" id="book-tags" maxlength="160" placeholder="aventuras, del cole, regalo"
               value="${escapeHtml(book ? (book.tags || []).join(', ') : '')}">
        <p class="field-hint">Separadas por comas. Luego puedes filtrar por ellas.</p>

        <label for="book-status">Estado</label>
        <select id="book-status">
          <option value="leyendo">Leyendo ahora</option>
          <option value="terminado">Ya lo terminó</option>
          <option value="pendiente">Pendiente / quiere leerlo</option>
        </select>

        <label for="book-pages">Páginas (opcional)</label>
        <input type="number" id="book-pages" min="1" max="3000" value="${book && book.pages ? escapeHtml(book.pages) : ''}">

        <label>Valoración (opcional)</label>
        <div class="star-picker" id="star-picker">
          ${[1, 2, 3, 4, 5].map(n => `<span data-n="${n}" class="${rating >= n ? 'on' : ''}">★</span>`).join('')}
        </div>

        <label for="book-synopsis">Sinopsis (opcional)</label>
        <textarea id="book-synopsis" class="synopsis-field" placeholder="De qué va el libro">${escapeHtml(book ? (book.description || '') : '')}</textarea>
        ${isNew ? `<p class="field-hint">Si eliges un libro del buscador se rellena sola, cuando Google Books la tiene.</p>` : ''}

        <label for="book-notes">Notas (opcional)</label>
        <textarea id="book-notes" placeholder="¿Qué te ha parecido?">${escapeHtml(book ? (book.notes || '') : '')}</textarea>

        <p class="form-error" id="book-error"></p>
        <div class="sheet-actions">
          <button class="btn-secondary" id="cancel-book">Cancelar</button>
          <button class="btn-confirm" id="confirm-book">${isNew ? 'Guardar libro' : 'Guardar cambios'}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('#book-status').value = book ? book.status : 'leyendo';

    if (isNew) {
      const searchInput = overlay.querySelector('#book-search');
      const resultsEl = overlay.querySelector('#book-search-results');
      searchInput.addEventListener('input', () => {
        clearTimeout(this.searchDebounce);
        const q = searchInput.value.trim();
        this.searchDebounce = setTimeout(() => this.searchBooks(q, resultsEl), 400);
      });

      const scanBtn = overlay.querySelector('#btn-scan');
      if (scanBtn) {
        scanBtn.onclick = async () => {
          const code = await scanBarcode();
          if (!code) return;   // cancelado o sin permiso; el aviso ya se dio en pantalla
          // El escáner devuelve el EAN-13, que en libros es el propio ISBN.
          searchInput.value = code;
          clearTimeout(this.searchDebounce);
          this.searchBooks(code, resultsEl);
        };
      }
    }

    const stars = overlay.querySelectorAll('#star-picker span');
    stars.forEach(s => {
      s.onclick = () => {
        const n = parseInt(s.dataset.n, 10);
        rating = n === rating ? 0 : n;
        stars.forEach(st => st.classList.toggle('on', parseInt(st.dataset.n, 10) <= rating));
      };
    });

    overlay.querySelector('#cancel-book').onclick = () => overlay.remove();
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    const error = overlay.querySelector('#book-error');
    const confirm = overlay.querySelector('#confirm-book');
    confirm.onclick = async () => {
      // Todo sale del formulario. Al elegir un libro del buscador sus datos se
      // vuelcan ahí, así que lo que se ve en pantalla es exactamente lo que se
      // guarda, correcciones a mano incluidas.
      const title = overlay.querySelector('#book-title').value.trim();
      if (!title) { error.textContent = 'Falta el título del libro.'; return; }

      const status = overlay.querySelector('#book-status').value;
      const pages = parseInt(overlay.querySelector('#book-pages').value, 10);
      const collection = overlay.querySelector('#book-collection').value.trim();
      const tags = parseTags(overlay.querySelector('#book-tags').value);
      const synopsis = overlay.querySelector('#book-synopsis').value.trim();
      // La carátula es lo único sin campo editable: viene del buscador o, al
      // editar, de lo que ya tuviera el libro.
      const cover = (this.selectedBookResult && this.selectedBookResult.cover)
        || (book ? book.cover : null)
        || null;

      const fields = {
        title,
        author: overlay.querySelector('#book-author').value.trim(),
        pages: Number.isFinite(pages) ? pages : null,
        cover,
        status,
        rating: rating || null,
        notes: overlay.querySelector('#book-notes').value.trim(),
        description: synopsis || null,
        collection: collection || null,
        tags
      };

      confirm.disabled = true;
      try {
        if (isNew) {
          const id = await store.addBook(this.familyId, this.child.id, {
            ...fields,
            addedAt: Date.now(),
            finishedAt: status === 'terminado' ? todayISO() : null
          });
          if (status === 'terminado') {
            this.freshlyFinishedId = id;
            setTimeout(() => { this.freshlyFinishedId = null; }, 700);
          }
        } else {
          // La fecha de fin solo se toca si el estado ha cambiado, para no
          // borrar el día real en que se terminó al corregir una errata.
          if (status !== book.status) {
            fields.finishedAt = status === 'terminado' ? todayISO() : null;
          }
          await store.updateBook(this.familyId, this.child.id, book.id, fields);
        }
        overlay.remove();
      } catch (e) {
        console.error(e);
        error.textContent = describeError(e);
        confirm.disabled = false;
      }
    };
  }
}

/** "aventuras, del cole,  aventuras " → ["aventuras", "del cole"] */
function parseTags(raw) {
  const seen = new Set();
  return String(raw || '')
    .split(',')
    .map(t => t.trim())
    .filter(t => {
      if (!t || t.length > 30) return false;
      const key = t.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 10);
}

function coverOf(volumeInfo) {
  const links = volumeInfo.imageLinks;
  if (!links) return null;
  const url = links.thumbnail || links.smallThumbnail;
  return url ? url.replace('http://', 'https://') : null;
}
