// Pantallas de acceso del adulto: iniciar sesión, crear familia y recuperar
// contraseña. Solo se ven al estrenar un dispositivo o tras cerrar sesión: el
// resto del tiempo Firebase recuerda la sesión y la app abre en "¿Quién eres?".
//
// No hace falta avisar a nadie cuando el acceso funciona: el cambio de sesión
// dispara onAuthChange en app.js, que se encarga de pintar lo siguiente.

import * as store from './store.js';
import { escapeHtml, describeError } from './util.js';

export function renderLogin(root) {
  root.className = '';
  root.innerHTML = `
    <div class="auth-screen">
      <span class="big">📖</span>
      <h2>Entrar</h2>
      <p>Introduce los datos de la familia.</p>
      <form id="login-form" novalidate>
        <label for="login-email">Correo electrónico</label>
        <input type="email" id="login-email" autocomplete="username" inputmode="email" placeholder="tu@correo.com">
        <label for="login-password">Contraseña</label>
        <input type="password" id="login-password" autocomplete="current-password" placeholder="••••••••">
        <p class="form-error" id="login-error"></p>
        <button type="submit" class="btn-primary" id="login-submit">Entrar</button>
      </form>
      <div class="auth-links">
        <button class="link-btn" id="go-register">Crear una familia nueva</button>
        <button class="link-btn" id="go-reset">He olvidado la contraseña</button>
      </div>
    </div>
  `;

  const form = root.querySelector('#login-form');
  const error = root.querySelector('#login-error');
  const submit = root.querySelector('#login-submit');

  form.onsubmit = async e => {
    e.preventDefault();
    const email = root.querySelector('#login-email').value.trim();
    const password = root.querySelector('#login-password').value;
    if (!email || !password) {
      error.textContent = 'Rellena el correo y la contraseña.';
      return;
    }
    submit.disabled = true;
    submit.textContent = 'Entrando…';
    error.textContent = '';
    try {
      await store.login({ email, password });
      // A partir de aquí toma el control onAuthChange en app.js.
    } catch (err) {
      error.textContent = describeError(err);
      submit.disabled = false;
      submit.textContent = 'Entrar';
    }
  };

  root.querySelector('#go-register').onclick = () => renderRegister(root);
  root.querySelector('#go-reset').onclick = () => renderReset(root);
}

export function renderRegister(root) {
  root.className = '';
  root.innerHTML = `
    <div class="auth-screen">
      <span class="big">🧳</span>
      <h2>Crear una familia</h2>
      <p>Solo hace falta una cuenta para toda la familia. Los niños entrarán después con su propia tarjeta.</p>
      <form id="register-form" novalidate>
        <label for="reg-family">Nombre de la familia</label>
        <input type="text" id="reg-family" maxlength="40" placeholder="Ej. Familia García">
        <p class="field-hint">Es solo el rótulo que aparecerá en la app.</p>

        <label for="reg-email">Correo electrónico</label>
        <input type="email" id="reg-email" autocomplete="username" inputmode="email" placeholder="tu@correo.com">
        <p class="field-hint">Se usa para entrar y para recuperar la contraseña si la olvidas.</p>

        <label for="reg-password">Contraseña</label>
        <input type="password" id="reg-password" autocomplete="new-password" placeholder="Mínimo 6 caracteres">

        <label for="reg-pin">PIN de adulto (4 números)</label>
        <input type="text" id="reg-pin" inputmode="numeric" maxlength="4" placeholder="••••">
        <p class="field-hint">Distinto de la contraseña. Protege la zona de gestión para que los niños,
        que usan el mismo dispositivo, no puedan cambiar perfiles ni códigos.</p>

        <p class="form-error" id="register-error"></p>
        <button type="submit" class="btn-primary" id="register-submit">Crear familia</button>
      </form>
      <div class="auth-links">
        <button class="link-btn" id="go-login">Ya tengo una familia creada</button>
      </div>
    </div>
  `;

  const form = root.querySelector('#register-form');
  const error = root.querySelector('#register-error');
  const submit = root.querySelector('#register-submit');

  form.onsubmit = async e => {
    e.preventDefault();
    const familyName = root.querySelector('#reg-family').value.trim();
    const email = root.querySelector('#reg-email').value.trim();
    const password = root.querySelector('#reg-password').value;
    const adultPin = root.querySelector('#reg-pin').value.trim();

    if (!familyName) { error.textContent = 'Pon un nombre a la familia.'; return; }
    if (!email) { error.textContent = 'Falta el correo electrónico.'; return; }
    if (password.length < 6) { error.textContent = 'La contraseña necesita al menos 6 caracteres.'; return; }
    if (!/^\d{4}$/.test(adultPin)) { error.textContent = 'El PIN de adulto son 4 números.'; return; }

    submit.disabled = true;
    submit.textContent = 'Creando…';
    error.textContent = '';
    try {
      await store.register({ email, password, familyName, adultPin });
    } catch (err) {
      error.textContent = describeError(err);
      submit.disabled = false;
      submit.textContent = 'Crear familia';
    }
  };

  root.querySelector('#go-login').onclick = () => renderLogin(root);
}

export function renderReset(root) {
  root.className = '';
  root.innerHTML = `
    <div class="auth-screen">
      <span class="big">🔑</span>
      <h2>Recuperar la contraseña</h2>
      <p>Te enviamos un correo con un enlace para ponerte una nueva.</p>
      <form id="reset-form" novalidate>
        <label for="reset-email">Correo electrónico</label>
        <input type="email" id="reset-email" inputmode="email" placeholder="tu@correo.com">
        <p class="form-error" id="reset-error"></p>
        <p class="form-ok" id="reset-ok"></p>
        <button type="submit" class="btn-primary" id="reset-submit">Enviar correo</button>
      </form>
      <div class="auth-links">
        <button class="link-btn" id="back-login">Volver</button>
      </div>
    </div>
  `;

  const form = root.querySelector('#reset-form');
  const error = root.querySelector('#reset-error');
  const ok = root.querySelector('#reset-ok');
  const submit = root.querySelector('#reset-submit');

  form.onsubmit = async e => {
    e.preventDefault();
    const email = root.querySelector('#reset-email').value.trim();
    if (!email) { error.textContent = 'Escribe tu correo.'; return; }
    submit.disabled = true;
    error.textContent = '';
    try {
      await store.sendPasswordReset(email);
      // No decimos si el correo existía o no: eso permitiría averiguar qué
      // direcciones están registradas.
      ok.textContent = 'Si ese correo tiene una familia registrada, recibirás el enlace en unos minutos. Mira también la carpeta de spam.';
      submit.textContent = 'Correo enviado';
    } catch (err) {
      error.textContent = describeError(err);
      submit.disabled = false;
    }
  };

  root.querySelector('#back-login').onclick = () => renderLogin(root);
}

/** Pide el PIN de adulto antes de dejar entrar a la zona de gestión. */
export function askAdultPin(expectedPin) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.innerHTML = `
      <div class="sheet">
        <h3>PIN de adulto</h3>
        <p class="field-hint" style="margin-bottom:10px;">Esta zona es para gestionar los perfiles.</p>
        <input type="text" inputmode="numeric" maxlength="4" class="pin-input" id="adult-pin-input" placeholder="••••">
        <p class="form-error" id="adult-pin-error"></p>
        <div class="sheet-actions">
          <button class="btn-secondary" id="adult-pin-cancel">Cancelar</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const input = overlay.querySelector('#adult-pin-input');
    const error = overlay.querySelector('#adult-pin-error');
    const close = value => { overlay.remove(); resolve(value); };

    input.focus();
    input.addEventListener('input', () => {
      if (input.value.length < 4) return;
      if (input.value.trim() === expectedPin) {
        close(true);
      } else {
        error.textContent = 'PIN incorrecto.';
        input.value = '';
      }
    });
    overlay.querySelector('#adult-pin-cancel').onclick = () => close(false);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(false); });
  });
}

/** Pide el código DDMM de un niño. Devuelve true si acierta. */
export function askChildCode(child) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.innerHTML = `
      <div class="sheet">
        <h3>Hola, ${escapeHtml(child.name)}</h3>
        <p class="field-hint" style="margin-bottom:10px;">Escribe el día y el mes de tu cumpleaños. Por ejemplo, el 15 de marzo es 1503.</p>
        <input type="text" inputmode="numeric" maxlength="4" class="pin-input" id="child-code-input" placeholder="••••">
        <p class="form-error" id="child-code-error"></p>
        <div class="sheet-actions">
          <button class="btn-secondary" id="child-code-cancel">Cancelar</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const input = overlay.querySelector('#child-code-input');
    const error = overlay.querySelector('#child-code-error');
    const close = value => { overlay.remove(); resolve(value); };

    input.focus();
    input.addEventListener('input', () => {
      if (input.value.length < 4) return;
      if (input.value.trim() === child.code) {
        close(true);
      } else {
        error.textContent = 'Ese no es. Prueba otra vez.';
        input.value = '';
      }
    });
    overlay.querySelector('#child-code-cancel').onclick = () => close(false);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(false); });
  });
}
