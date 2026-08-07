# Temas pendientes

Cosas que hay que hacer pero que no bloquean el desarrollo ahora mismo. Anotadas para
que no se pierdan. Las tareas de desarrollo en sí están en el brief, sección 7; esto es
lo demás: configuración, limpieza y decisiones aplazadas.

## Antes de publicar en GitHub Pages

- [ ] **Restringir la clave de Google Books por dominio.**
      La clave `googleBooksApiKey` de `js/firebase-config.js` acabará publicada y
      visible para cualquiera (es normal en una web, pero aun así). Se creó con
      *Restricciones de aplicación → Ninguno* a propósito, para no romper `localhost`
      mientras desarrollamos.
      Cuando exista la dirección definitiva: consola de Google Cloud → proyecto
      `pasaporte-lector` → APIs y servicios → Credenciales → editar la clave
      *Google Books - Pasaporte Lector* → Restricciones de aplicación → **Sitios web**
      → añadir el dominio de GitHub Pages y `localhost:8000`.
      Sin esto, cualquiera que la copie puede gastar la cuota diaria de 1.000 búsquedas.
      *No tocar nunca la otra clave, la de Firebase: restringirla mal deja la app sin
      acceso a Firestore.*

- [ ] **Autorizar el dominio de GitHub Pages en Firebase Authentication.**
      Consola de Firebase → Authentication → Settings → Dominios autorizados.
      Sin esto el inicio de sesión falla desde el dominio publicado.

- [ ] **Comprobar el diseño responsive en los tres dispositivos reales**: iPhone
      (Safari), tablet Android (Chrome) y Fire (Silk). Hasta ahora solo se ha probado
      en escritorio.

## Limpieza

- [ ] **Borrar los datos de prueba de Firestore.** El PIN, el niño y el libro creados
      el 6/8/2026 cuelgan de la raíz (`children`, `config`), del modelo antiguo. Las
      reglas nuevas ya los dejan inaccesibles desde la app, pero siguen ocupando sitio
      en la base de datos. Se borran desde la consola de Firebase → Firestore → Datos,
      seleccionando cada colección y usando "Eliminar colección".

- [ ] **Borrar `pasaporte_lector.html`** (el prototipo original de Claude.ai) cuando la
      versión nueva esté validada. Se mantiene de momento solo como referencia visual.

## Decisiones aplazadas

- [ ] **Segundo adulto en la misma familia.** Se decidió una sola cuenta por familia.
      `families/{familyId}.adultUids` se guarda como lista precisamente para poder
      añadir al segundo padre más adelante sin migrar nada. Haría falta un código de
      invitación.

- [ ] **Escaneo de código de barras en iPhone.** Queda fuera a propósito: se usa la API
      `BarcodeDetector` del navegador, que no existe en iOS (Apple obliga a que todos
      los navegadores usen WebKit, así que Chrome en iPhone tampoco vale). Si algún día
      hace falta, la solución es añadir la librería ZXing-js por CDN.

- [x] ~~**Endurecer las reglas de Firestore.**~~ Hecho. Ya exigen sesión iniciada y
      limitan cada familia a sus propios datos. **Hay que volver a publicarlas** en la
      consola: Firestore Database → Reglas → pegar `firestore.rules` → Publicar.

- [ ] **Acceso con el nombre de la familia en vez del correo.** Descartado por ahora
      (expondría un correo a quien acierte el nombre; ver brief §6.0). Si se quiere,
      es un cambio pequeño y sin migración: escribir la tabla `nombre → correo` y
      cambiar la pantalla de inicio de sesión.

## Mantenimiento

- [ ] **Versión del SDK de Firebase fijada en 11.0.2** en `js/store.js` (dos URLs de
      importación). No hay prisa por actualizar, pero conviene revisarlo de vez en
      cuando. Se fijó una versión concreta a propósito, para que una actualización de
      Google no rompa la app sin avisar.
