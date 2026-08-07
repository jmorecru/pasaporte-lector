// Pasaporte Lector — arranque, estado de sesión y navegación entre pantallas.
//
// Las cuatro pantallas:
//   auth     → el adulto entra o crea la familia (solo al estrenar dispositivo)
//   who      → "¿Quién eres?": una tarjeta por hijo + acceso de adulto
//   library  → los libros de un niño, tras acertar su código
//   admin    → gestión de perfiles, tras el PIN de adulto

import { isPlaceholderConfig } from './firebase-config.js';
import { escapeHtml, describeError } from './util.js';

const root = document.getElementById('root');

// Si la configuración de Firebase sigue con los marcadores de posición, no
// llegamos ni a cargar el SDK: explicamos qué falta en vez de reventar.
if (isPlaceholderConfig) {
  renderSetupNotice();
} else {
  start();
}

async function start() {
  const [store, auth, library, admin] = await Promise.all([
    import('./store.js'),
    import('./screens-auth.js'),
    import('./screens-library.js'),
    import('./screens-admin.js')
  ]);
  new App({ store, auth, library, admin }).init();
}

function renderSetupNotice() {
  root.className = '';
  root.innerHTML = `
    <div class="setup-notice">
      <h2>Falta conectar Firebase</h2>
      <p>La app está lista, pero <code>js/firebase-config.js</code> todavía tiene los valores de ejemplo.</p>
      <ol>
        <li>Crea el proyecto en <code>console.firebase.google.com</code> y activa Firestore.</li>
        <li>Registra una app web y copia su objeto de configuración.</li>
        <li>Pega los valores en <code>js/firebase-config.js</code> y recarga esta página.</li>
      </ol>
      <p style="margin-top:12px;">El paso a paso completo está en <code>SETUP_FIREBASE.md</code>.</p>
    </div>
  `;
}

class App {
  constructor(modules) {
    this.store = modules.store;
    this.authScreens = modules.auth;
    this.LibraryScreen = modules.library.LibraryScreen;
    this.AdminScreen = modules.admin.AdminScreen;

    this.familyId = null;
    this.family = null;
    this.children = [];
    this.childrenLoaded = false;
    this.screen = null;          // pantalla activa con mount()/destroy()
    this.unsubChildren = null;
  }

  init() {
    this.showLoading('Abriendo la biblioteca…');
    this.store.onAuthChange(user => {
      this.teardown();
      if (!user) {
        this.authScreens.renderLogin(root);
      } else {
        this.bootFamily(user);
      }
    });
  }

  /** Deja el estado limpio al cambiar de sesión. */
  teardown() {
    this.closeScreen();
    if (this.unsubChildren) { this.unsubChildren(); this.unsubChildren = null; }
    this.familyId = null;
    this.family = null;
    this.children = [];
    this.childrenLoaded = false;
  }

  closeScreen() {
    if (this.screen) { this.screen.destroy(); this.screen = null; }
  }

  async bootFamily(user) {
    this.showLoading('Abriendo la biblioteca…');
    try {
      const familyId = await this.resolveFamilyId(user);
      if (!familyId) {
        this.renderFatal('Tu cuenta existe pero no tiene ninguna familia asociada. Escríbeme y lo arreglamos desde la consola de Firebase.');
        return;
      }
      this.familyId = familyId;
      this.family = await this.store.getFamily(familyId);
      if (!this.family) {
        this.renderFatal('No se encontraron los datos de la familia.');
        return;
      }
      this.subscribeChildren();
    } catch (err) {
      this.renderFatal('No se pudo abrir la familia.', err);
    }
  }

  /**
   * El id de familia es el uid del adulto que la creó. Consultamos su ficha solo
   * si esa vía directa falla, que es lo que pasaría con un segundo adulto.
   *
   * El reintento cubre una carrera real: al registrarse, Firebase avisa del
   * inicio de sesión en cuanto existe la cuenta, que puede ser un instante antes
   * de que terminen de escribirse los documentos de la familia.
   */
  async resolveFamilyId(user) {
    for (let intento = 0; intento < 6; intento++) {
      const direct = await this.store.getFamily(user.uid);
      if (direct) return user.uid;
      const fromProfile = await this.store.getFamilyId(user.uid).catch(() => null);
      if (fromProfile) return fromProfile;
      await new Promise(r => setTimeout(r, 300));
    }
    return null;
  }

  subscribeChildren() {
    this.unsubChildren = this.store.subscribeChildren(
      this.familyId,
      children => {
        this.children = children;
        this.childrenLoaded = true;
        // Solo repintamos si estamos en una pantalla que depende de la lista.
        if (!this.screen) this.renderWho();
        else if (this.screen instanceof this.AdminScreen) this.screen.onChildrenChanged();
      },
      err => this.renderFatal('No se pudieron cargar los pasaportes.', err)
    );
  }

  // ---- Pantalla "¿Quién eres?" ----

  renderWho() {
    this.closeScreen();
    root.className = '';
    const familyName = this.family && this.family.name ? this.family.name : 'Mi familia';
    root.innerHTML = `
      <div class="who-screen">
        <p class="who-family">${escapeHtml(familyName)}</p>
        <h2>¿Quién eres?</h2>
        ${this.children.length
          ? `<div class="who-grid">
               ${this.children.map(c => `
                 <button class="who-card" data-child="${c.id}" style="--card-color:${escapeHtml(c.color || '#2F6F62')};">
                   <span class="who-initial">${escapeHtml((c.name || '?').trim().charAt(0).toUpperCase())}</span>
                   <span class="who-name">${escapeHtml(c.name)}</span>
                 </button>
               `).join('')}
             </div>`
          : `<div class="empty-state">
               <span class="big">🧳</span>
               <p>Todavía no hay ningún pasaporte.<br>Entra como adulto para crear el primero.</p>
             </div>`}
        <button class="link-btn adult-entry" id="btn-adult">Soy un adulto</button>
      </div>
    `;

    root.querySelectorAll('.who-card').forEach(btn => {
      btn.onclick = () => this.enterChild(btn.dataset.child);
    });
    root.querySelector('#btn-adult').onclick = () => this.enterAdmin();
  }

  async enterChild(childId) {
    const child = this.children.find(c => c.id === childId);
    if (!child) return;
    const ok = await this.authScreens.askChildCode(child);
    if (!ok) return;
    this.closeScreen();
    this.screen = new this.LibraryScreen(root, this.familyId, child, {
      onExit: () => this.renderWho()
    });
    this.screen.mount();
  }

  async enterAdmin() {
    const ok = await this.authScreens.askAdultPin(this.family.adultPin);
    if (!ok) return;
    this.openAdmin();
  }

  openAdmin() {
    this.closeScreen();
    this.screen = new this.AdminScreen(
      root,
      this.family,
      () => this.children,
      {
        onExit: () => this.renderWho(),
        onFamilyChange: () => {},
        // Desde gestión el adulto entra al pasaporte sin teclear el código del niño:
        // ya ha demostrado quién es con el PIN.
        onOpenChild: child => {
          this.closeScreen();
          this.screen = new this.LibraryScreen(root, this.familyId, child, {
            onExit: () => this.openAdmin()
          });
          this.screen.mount();
        }
      }
    );
    this.screen.mount();
  }

  // ---- Pantallas auxiliares ----

  showLoading(message) {
    root.className = 'loading';
    root.textContent = message;
  }

  renderFatal(message, err) {
    if (err) console.error(message, err);
    this.closeScreen();
    root.className = '';
    root.innerHTML = `
      <div class="setup-notice">
        <h2>Algo ha fallado</h2>
        <p>${escapeHtml(message)}</p>
        ${err ? `<p><code>${escapeHtml(describeError(err))}</code></p>` : ''}
        <div class="sheet-actions">
          <button class="btn-secondary" id="fatal-logout">Cerrar sesión</button>
          <button class="btn-confirm" id="fatal-reload">Reintentar</button>
        </div>
      </div>
    `;
    root.querySelector('#fatal-reload').onclick = () => location.reload();
    root.querySelector('#fatal-logout').onclick = () => this.store.logout();
  }
}
