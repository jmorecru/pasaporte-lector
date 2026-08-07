// Panel de adulto: crear y gestionar los pasaportes de los hijos.
// Vive detrás del PIN de adulto porque los niños usan el mismo dispositivo con
// la sesión de la familia ya iniciada.

import * as store from './store.js';
import { escapeHtml, describeError, isValidDDMM } from './util.js';

const PALETTE = ['#2F6F62', '#A23B3B', '#C9A227', '#4C6A92', '#7A5C3E', '#8E5B8A'];

export class AdminScreen {
  /**
   * @param {HTMLElement} root
   * @param {object} family    { id, name, adultPin }
   * @param {() => object[]} getChildren  lista de hijos, siempre al día
   * @param {{onExit: () => void, onOpenChild: (child) => void, onFamilyChange: () => void}} handlers
   */
  constructor(root, family, getChildren, { onExit, onOpenChild, onFamilyChange }) {
    this.root = root;
    this.family = family;
    this.getChildren = getChildren;
    this.onExit = onExit;
    this.onOpenChild = onOpenChild;
    this.onFamilyChange = onFamilyChange;
    this.error = null;
    this.reservas = new Map();     // childId → libros pedidos
    this.unsubReservas = [];
  }

  mount() {
    this.render();
    this.escucharReservas();
  }

  /** La lista de hijos ha cambiado: hay que rehacer las escuchas por niño. */
  onChildrenChanged() {
    this.escucharReservas();
    this.render();
  }

  destroy() {
    this.unsubReservas.forEach(u => u());
    this.unsubReservas = [];
  }

  /**
   * Escucha las peticiones de biblioteca de cada hijo.
   *
   * Se rehace cuando cambia la lista de hijos, porque hay una escucha por niño.
   * Con dos o tres hijos el coste es despreciable, y evita duplicar el id de la
   * familia dentro de cada libro solo para poder hacer una consulta global.
   */
  escucharReservas() {
    this.unsubReservas.forEach(u => u());
    this.unsubReservas = [];
    this.getChildren().forEach(child => {
      const unsub = store.subscribeReservedBooks(
        this.family.id, child.id,
        libros => {
          this.reservas.set(child.id, libros);
          this.render();
        },
        () => { /* si falla, la sección simplemente no aparece */ }
      );
      this.unsubReservas.push(unsub);
    });
  }

  render() {
    const children = this.getChildren();
    this.root.className = '';
    this.root.innerHTML = `
      ${this.error ? `<div class="sync-banner visible">⚠ ${escapeHtml(this.error)}</div>` : ''}
      <div class="screen-bar">
        <button class="link-btn" id="btn-exit">‹ Volver</button>
        <button class="link-btn danger" id="btn-logout">Cerrar sesión</button>
      </div>

      <div class="panel">
        <div class="child-heading">
          <h2>Gestión</h2>
          <span class="stamp-count">${escapeHtml(this.family.name || 'Mi familia')}</span>
        </div>

        ${this.reservasHtml(children)}

        <h3 class="section-title">Pasaportes</h3>
        <div class="admin-list">
          ${children.length
            ? children.map(c => this.childRow(c)).join('')
            : `<p class="field-hint">Todavía no hay ningún pasaporte. Crea el primero.</p>`}
        </div>
        <button class="btn-primary" id="btn-add-child" style="margin-top:14px;">+ Añadir niño o niña</button>

        <h3 class="section-title">Ajustes de la familia</h3>
        <div class="admin-list">
          <div class="admin-row">
            <div class="admin-row-main">
              <p class="admin-row-title">Nombre de la familia</p>
              <p class="admin-row-sub">${escapeHtml(this.family.name || '—')}</p>
            </div>
            <button class="icon-btn" id="btn-edit-family">Cambiar</button>
          </div>
          <div class="admin-row">
            <div class="admin-row-main">
              <p class="admin-row-title">PIN de adulto</p>
              <p class="admin-row-sub">Protege esta pantalla</p>
            </div>
            <button class="icon-btn" id="btn-edit-pin">Cambiar</button>
          </div>
        </div>
      </div>
    `;
    this.bindEvents();
  }

  /** Libros que los hijos han pedido reservar, de todos los pasaportes juntos. */
  reservasHtml(children) {
    const pedidos = [];
    children.forEach(child => {
      (this.reservas.get(child.id) || []).forEach(libro => pedidos.push({ child, libro }));
    });
    if (!pedidos.length) return '';
    // Los más antiguos primero: son los que llevan más tiempo esperando.
    pedidos.sort((a, b) => (a.libro.reservedAt || 0) - (b.libro.reservedAt || 0));

    return `
      <h3 class="section-title">🏛 Pedir en la biblioteca (${pedidos.length})</h3>
      <div class="admin-list">
        ${pedidos.map(({ child, libro }) => `
          <div class="admin-row">
            <span class="child-dot" style="background:${escapeHtml(child.color || '#2F6F62')};"></span>
            <div class="admin-row-main">
              <p class="admin-row-title">${escapeHtml(libro.title)}</p>
              <p class="admin-row-sub">Lo quiere ${escapeHtml(child.name)}${
                libro.author ? ' · ' + escapeHtml(libro.author) : ''
              }</p>
            </div>
            <button class="icon-btn" data-reserva-hecha="${child.id}|${libro.id}">✔ Conseguido</button>
          </div>
        `).join('')}
      </div>
    `;
  }

  childRow(c) {
    const color = c.color || PALETTE[0];
    return `
      <div class="admin-row">
        <span class="child-dot" style="background:${escapeHtml(color)};"></span>
        <div class="admin-row-main">
          <p class="admin-row-title">${escapeHtml(c.name)}</p>
          <p class="admin-row-sub">Código: ${escapeHtml(c.code || '—')}</p>
        </div>
        <button class="icon-btn" data-action="open" data-id="${c.id}">Ver</button>
        <button class="icon-btn" data-action="edit" data-id="${c.id}">Editar</button>
        <button class="icon-btn danger" data-action="delete" data-id="${c.id}">Borrar</button>
      </div>
    `;
  }

  bindEvents() {
    this.root.querySelector('#btn-exit').onclick = () => this.onExit();
    this.root.querySelector('#btn-logout').onclick = () => this.confirmLogout();
    this.root.querySelector('#btn-add-child').onclick = () => this.openChildSheet(null);
    this.root.querySelector('#btn-edit-family').onclick = () => this.openFamilyNameSheet();
    this.root.querySelector('#btn-edit-pin').onclick = () => this.openPinSheet();

    this.root.querySelectorAll('[data-reserva-hecha]').forEach(btn => {
      btn.onclick = async () => {
        const [childId, bookId] = btn.dataset.reservaHecha.split('|');
        btn.disabled = true;
        try {
          // Solo se borra la marca: el libro sigue donde estaba en su lectura.
          await store.updateBook(this.family.id, childId, bookId, {
            reserved: false,
            reservedAt: null
          });
        } catch (e) {
          console.error(e);
          this.error = describeError(e);
          btn.disabled = false;
          this.render();
        }
      };
    });

    this.root.querySelectorAll('[data-action]').forEach(btn => {
      const child = this.getChildren().find(c => c.id === btn.dataset.id);
      if (!child) return;
      if (btn.dataset.action === 'open') btn.onclick = () => this.onOpenChild(child);
      if (btn.dataset.action === 'edit') btn.onclick = () => this.openChildSheet(child);
      if (btn.dataset.action === 'delete') btn.onclick = () => this.confirmDeleteChild(child);
    });
  }

  // ---- Crear y editar hijos ----

  /** @param {object|null} child  null para crear uno nuevo */
  openChildSheet(child) {
    const isNew = !child;
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.innerHTML = `
      <div class="sheet">
        <h3>${isNew ? 'Nuevo pasaporte' : 'Editar pasaporte'}</h3>
        <label for="child-name">Nombre</label>
        <input type="text" id="child-name" maxlength="30" placeholder="Ej. Eduardo"
               value="${escapeHtml(child ? child.name : '')}">

        <label for="child-code">Código de acceso (día y mes de su cumpleaños)</label>
        <input type="text" id="child-code" inputmode="numeric" maxlength="4" placeholder="1503"
               value="${escapeHtml(child ? (child.code || '') : '')}">
        <p class="field-hint">Cuatro números, DDMM. El 15 de marzo sería 1503. Es lo que teclea
        para entrar en su pasaporte, así que tiene que poder recordarlo.</p>

        <p class="form-error" id="child-error"></p>
        <div class="sheet-actions">
          <button class="btn-secondary" id="cancel-child">Cancelar</button>
          <button class="btn-confirm" id="confirm-child">${isNew ? 'Crear' : 'Guardar'}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    overlay.querySelector('#cancel-child').onclick = () => overlay.remove();

    const error = overlay.querySelector('#child-error');
    const confirm = overlay.querySelector('#confirm-child');
    confirm.onclick = async () => {
      const name = overlay.querySelector('#child-name').value.trim();
      const code = overlay.querySelector('#child-code').value.trim();
      if (!name) { error.textContent = 'Falta el nombre.'; return; }
      if (!isValidDDMM(code)) {
        error.textContent = 'El código son 4 números con un día y un mes válidos (DDMM).';
        return;
      }
      // Dos hermanos con el mismo código harían imposible distinguir quién entra.
      const clash = this.getChildren().find(c => c.code === code && (!child || c.id !== child.id));
      if (clash) {
        error.textContent = `Ese código ya lo usa ${clash.name}. Elige otro.`;
        return;
      }

      confirm.disabled = true;
      try {
        if (isNew) {
          const used = this.getChildren().length;
          await store.addChild(this.family.id, {
            name, code, color: PALETTE[used % PALETTE.length]
          });
        } else {
          await store.updateChild(this.family.id, child.id, { name, code });
        }
        overlay.remove();
      } catch (e) {
        console.error(e);
        error.textContent = describeError(e);
        confirm.disabled = false;
      }
    };
  }

  confirmDeleteChild(child) {
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.innerHTML = `
      <div class="sheet">
        <h3>Borrar el pasaporte de ${escapeHtml(child.name)}</h3>
        <p class="field-hint">Se borrarán también <strong>todos sus libros</strong>, con sus
        valoraciones, notas y sellos. Esto no se puede deshacer.</p>
        <label for="delete-confirm">Escribe <strong>${escapeHtml(child.name)}</strong> para confirmar</label>
        <input type="text" id="delete-confirm" autocomplete="off">
        <p class="form-error" id="delete-error"></p>
        <div class="sheet-actions">
          <button class="btn-secondary" id="cancel-delete">Cancelar</button>
          <button class="btn-danger" id="confirm-delete">Borrar definitivamente</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    overlay.querySelector('#cancel-delete').onclick = () => overlay.remove();

    const error = overlay.querySelector('#delete-error');
    const confirm = overlay.querySelector('#confirm-delete');
    confirm.onclick = async () => {
      const typed = overlay.querySelector('#delete-confirm').value.trim();
      if (typed.toLowerCase() !== child.name.trim().toLowerCase()) {
        error.textContent = 'El nombre no coincide.';
        return;
      }
      confirm.disabled = true;
      confirm.textContent = 'Borrando…';
      try {
        await store.deleteChild(this.family.id, child.id);
        overlay.remove();
      } catch (e) {
        console.error(e);
        error.textContent = describeError(e);
        confirm.disabled = false;
        confirm.textContent = 'Borrar definitivamente';
      }
    };
  }

  // ---- Ajustes de la familia ----

  openFamilyNameSheet() {
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.innerHTML = `
      <div class="sheet">
        <h3>Nombre de la familia</h3>
        <label for="family-name">Nombre</label>
        <input type="text" id="family-name" maxlength="40" value="${escapeHtml(this.family.name || '')}">
        <p class="field-hint">Solo es el rótulo que se ve en la app.</p>
        <p class="form-error" id="family-error"></p>
        <div class="sheet-actions">
          <button class="btn-secondary" id="cancel-family">Cancelar</button>
          <button class="btn-confirm" id="confirm-family">Guardar</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    overlay.querySelector('#cancel-family').onclick = () => overlay.remove();

    const error = overlay.querySelector('#family-error');
    const confirm = overlay.querySelector('#confirm-family');
    confirm.onclick = async () => {
      const name = overlay.querySelector('#family-name').value.trim();
      if (!name) { error.textContent = 'El nombre no puede quedar vacío.'; return; }
      confirm.disabled = true;
      try {
        await store.updateFamily(this.family.id, { name });
        this.family.name = name;
        overlay.remove();
        this.onFamilyChange();
        this.render();
      } catch (e) {
        error.textContent = describeError(e);
        confirm.disabled = false;
      }
    };
  }

  openPinSheet() {
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.innerHTML = `
      <div class="sheet">
        <h3>Cambiar el PIN de adulto</h3>
        <label for="new-pin">PIN nuevo (4 números)</label>
        <input type="text" id="new-pin" inputmode="numeric" maxlength="4" placeholder="••••">
        <p class="field-hint">Que no sea el cumpleaños de ninguno de tus hijos: esos códigos ya los conocen.</p>
        <p class="form-error" id="pin-error"></p>
        <div class="sheet-actions">
          <button class="btn-secondary" id="cancel-pin">Cancelar</button>
          <button class="btn-confirm" id="confirm-pin">Guardar</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    overlay.querySelector('#cancel-pin').onclick = () => overlay.remove();

    const error = overlay.querySelector('#pin-error');
    const confirm = overlay.querySelector('#confirm-pin');
    confirm.onclick = async () => {
      const pin = overlay.querySelector('#new-pin').value.trim();
      if (!/^\d{4}$/.test(pin)) { error.textContent = 'El PIN son 4 números.'; return; }
      const clash = this.getChildren().find(c => c.code === pin);
      if (clash) {
        error.textContent = `Ese es el código de ${clash.name}; entraría en esta pantalla sin querer. Elige otro.`;
        return;
      }
      confirm.disabled = true;
      try {
        await store.updateFamily(this.family.id, { adultPin: pin });
        this.family.adultPin = pin;
        overlay.remove();
        this.onFamilyChange();
      } catch (e) {
        error.textContent = describeError(e);
        confirm.disabled = false;
      }
    };
  }

  confirmLogout() {
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.innerHTML = `
      <div class="sheet">
        <h3>¿Cerrar sesión?</h3>
        <p class="field-hint">Este dispositivo dejará de recordar la familia y habrá que volver a
        introducir el correo y la contraseña para usar la app. Los datos no se pierden.</p>
        <div class="sheet-actions">
          <button class="btn-secondary" id="cancel-logout">Cancelar</button>
          <button class="btn-danger" id="confirm-logout">Cerrar sesión</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    overlay.querySelector('#cancel-logout').onclick = () => overlay.remove();
    overlay.querySelector('#confirm-logout').onclick = async () => {
      try {
        await store.logout();   // onAuthChange en app.js pinta el inicio de sesión
      } catch (e) {
        console.error(e);
      }
      overlay.remove();
    };
  }
}
