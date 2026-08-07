# Temas pendientes

Cosas que hay que hacer pero que no bloquean el desarrollo. Las tareas de desarrollo
están en el brief, sección 7; esto es lo demás: configuración, limpieza y decisiones
aplazadas.

Última revisión: 7 de agosto de 2026.

---

## ✅ Ya configurado (no tocar)

Para no volver a dudar de si algo se hizo:

- Proyecto de Firebase `pasaporte-lector`, con Firestore en `eur3`.
- App web registrada; credenciales en `js/firebase-config.js`.
- Authentication con **Correo electrónico/contraseña** habilitado.
- **Reglas de seguridad publicadas** — verificado el 7/8/2026 leyendo la base de datos
  sin sesión: las cuatro colecciones devuelven `403`.
- Clave propia de Google Books creada, con la Books API habilitada.
- Repositorio público `jmorecru/pasaporte-lector` y GitHub Pages activo en
  **https://jmorecru.github.io/pasaporte-lector/**
- `jmorecru.github.io` autorizado en Firebase → Authentication → Settings.
- Datos de prueba del modelo antiguo borrados.

---

## Pendiente de verdad

### Lo siguiente que toca

- [ ] **Probar la app en los tres dispositivos reales**: iPhone (Safari), tablet Android
      (Chrome) y Fire (Silk). En navegador de escritorio funciona todo. Falta ver cómo
      se comporta en pantalla pequeña y si Safari da guerra.
      Probar también "Añadir a pantalla de inicio": debería abrirse a pantalla completa
      con el icono del libro.

### Seguridad y limpieza

- [ ] **Confirmar si la restricción de la clave de Books hace algo.** Se restringió a
      los dominios `https://jmorecru.github.io/*` y `http://localhost:8000/*`, pero al
      probarla 25 minutos después seguía aceptando peticiones sin `referer` y con
      `referer` de terceros. O tarda más en propagarse, o la API de Books no aplica
      restricciones de aplicación. Si es lo segundo, no hay arreglo: solo saberlo.
      Riesgo real si no funciona: que alguien gaste las 1.000 búsquedas diarias.

- [ ] **Cerrar los dos avisos de secret scanning de GitHub** como *Won't fix*, con el
      motivo "clave de navegador, pública por diseño; protegida por las reglas de
      Firestore". No rotar las claves: la nueva quedaría igual de pública.
      - https://github.com/jmorecru/pasaporte-lector/security/secret-scanning/1
      - https://github.com/jmorecru/pasaporte-lector/security/secret-scanning/2

- [ ] **Opcional: restringir por dominio la clave de Firebase.** Evitaría que alguien
      creara cuentas en el proyecto desde fuera. **Ojo**: hacerlo mal deja la app sin
      acceso a Firestore ni al login. Modo seguro: poner solo *Restricciones de
      aplicación → Sitios web* con esos dos dominios, y dejar *Restricciones de API* en
      "No restringir", que es la parte que rompe cosas. Hacerlo **después** de validar
      la app en los móviles, y de uno en uno.

- [ ] **Borrar `pasaporte_lector.html`**, el prototipo original de Claude.ai. Ya está
      superado y se publicó al repositorio por inercia.

### Higiene de la cuenta de GitHub (nada urgente)

- [ ] **`git config --global user.email` sigue siendo `jamoreno@enagas.es`.** En este
      repositorio no importa (usa la dirección anónima de GitHub solo para él), pero el
      próximo proyecto personal volvería a llevar el correo del trabajo en cada commit.
      Arreglo permanente: GitHub → Settings → Emails → **"Block command line pushes that
      expose my email"**.

- [ ] **Ocultar la pertenencia a las organizaciones de Enagás**, si no quieres que el
      perfil público las anuncie. Es por organización:
      `https://github.com/orgs/NOMBRE/people` → tu fila → visibilidad → Private.
      Puramente cosmético, no cambia permisos.
      Organizaciones: `HubDesarrollo`, `enagas-dsi-gdt-msc`,
      `enagas-dsi-gdt-libraries`, `enagas-dsi-gdt-shared-microservices`,
      `enagas-dsi-gdt-mrb`.

---

## Decisiones aplazadas

- [ ] **Segundo adulto en la misma familia.** Se decidió una sola cuenta por familia.
      `families/{familyId}.adultUids` se guarda como lista precisamente para poder
      añadirlo más adelante sin migrar nada. Haría falta un código de invitación.

- [ ] **Acceso con el nombre de la familia en vez del correo.** Descartado: expondría un
      correo a quien acierte el nombre (ver brief §6.0). Si se quiere, es un cambio
      pequeño y sin migración.

- [ ] **Escaneo de código de barras en iPhone.** Fuera a propósito: se usará la API
      `BarcodeDetector`, que no existe en iOS. Si algún día hace falta, la solución es
      añadir ZXing-js por CDN.

## Mantenimiento

- [ ] **Versión del SDK de Firebase fijada en 11.0.2** en `js/store.js` (tres URLs de
      importación). Se fijó a propósito para que una actualización de Google no rompa la
      app sin avisar. Conviene revisarlo de vez en cuando.
