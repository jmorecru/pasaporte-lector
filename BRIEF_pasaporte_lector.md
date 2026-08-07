# Pasaporte Lector — Brief de proyecto para Claude Code

Contexto: app familiar de seguimiento de lectura infantil, con catálogo real de libros (Google Books) y despliegue en Firebase + GitHub Pages. Este documento resume todo lo decidido hasta ahora para retomar el desarrollo con Claude Code en VS Code.

## 1. Objetivo

Una app web donde cada hijo registra por separado los libros que va leyendo (pendiente / leyendo / terminado), con carátulas y datos reales de libros, accesible desde iPhone, tablet Android y Fire tablet.

## 2. Stack técnico decidido

- **Frontend**: HTML/CSS/JS vanilla, sin frameworks ni build tools (mantener simple, un proyecto pequeño).
- **Backend/datos**: Firebase (Firestore) — el usuario tiene cuenta de Google. Sustituye al `window.storage` usado en el prototipo (esa función solo existe dentro de artefactos de Claude.ai y no sirve fuera).
- **Hosting**: GitHub Pages, usando la cuenta de GitHub ya existente del usuario. (Alternativa aceptada: Netlify, pero se prefiere Pages por simplicidad.)
- **IDE**: VS Code con la extensión de Claude Code instalada.
- **Distribución en dispositivos**: no se construye APK nativo (no cubriría iOS). Se usa la web con la opción "Añadir a pantalla de inicio" en cada dispositivo para que se sienta como una app instalada (icono, pantalla completa).

## 3. Requisitos funcionales

1. **Pantalla de entrada "¿Quién eres?"**: una tarjeta por cada hijo (nombre, color/avatar). Al tocar la suya, pide un código personal — el acordado es su **fecha de cumpleaños en formato DDMM**. Solo accede a su propio pasaporte/biblioteca, no ve los de sus hermanos.
2. **Acceso de adulto separado**: un botón discreto (ej. "Soy un adulto") con un PIN propio del padre/madre, para gestionar perfiles: crear hijos nuevos, cambiar sus códigos, ver todos los pasaportes.
   - *Nota de seguridad*: esto es una barrera básica pensada para evitar curiosidad entre hermanos o visitas casuales al enlace, no autenticación robusta de nivel profesional. El usuario es consciente y lo acepta para este uso familiar.
3. **Añadir libro** con buscador conectado a la API pública de Google Books (`https://www.googleapis.com/books/v1/volumes?q=...`), que autocompleta título, autor, número de páginas y carátula. Si no se encuentra, permite introducir los datos a mano.
4. **Estados del libro**: Pendiente / Leyendo / Terminado. Al marcar "Terminado" se registra la fecha y se muestra un sello visual (ver sección de diseño).
5. **Valoración opcional** (estrellas, 1 a 5) y **notas** de texto libre por libro.
6. **Filtros** por estado dentro del perfil de cada niño.
7. **Multiplataforma real**: debe funcionar bien en Safari (iPhone), Chrome (tablet Android) y Silk (Fire tablet) sin diferencias de comportamiento.
8. **Sincronización en tiempo real** entre dispositivos vía Firestore (si un hijo añade un libro desde la tablet, se refleja al momento en el móvil del padre, por ejemplo).
9. **Añadir libro por tres vías**: búsqueda por **título/autor** (ya existe), búsqueda por **ISBN** tecleado, y **escaneo del código de barras** con la cámara del dispositivo.
10. **Temporizador de lectura**: el niño lo arranca al empezar a leer y lo para al terminar. Al pararlo, la app pregunta **de qué página a qué página** ha leído. La última página leída queda guardada y funciona como marcapáginas para la siguiente sesión.
11. **Metas configurables**: retos de **minutos** (diario, semanal) y retos de **libros terminados** (semanal, mensual). Con progreso visible.
12. **Insignias por logros**: sellos que se desbloquean al cumplir hitos (p. ej. 3 libros en una semana, 10 libros en un mes, racha de días leyendo). Encajan con el tema "pasaporte" — son sellos más del cuaderno.

## 4. Diseño visual ya definido (tema "pasaporte de lectura")

Paleta de color (variables CSS):
```
--bg: #EFE7D8       /* fondo general */
--paper: #F8F3E8    /* tarjetas y paneles */
--ink: #1B2A4A       /* texto principal */
--ink-soft: #4A5A78  /* texto secundario */
--teal: #2F6F62      /* acento principal, botones */
--teal-dark: #1F4D43 /* hover/activo */
--gold: #C9A227      /* estrellas, acento secundario */
--brick: #A23B3B     /* estado "leyendo", alertas */
--line: #D8CDB4      /* bordes */
```

Tipografías (Google Fonts):
- **Spectral** — títulos y nombres (display serif).
- **Special Elite** — estilo máquina de escribir, usado en los "sellos" de fecha y elementos tipo pasaporte.
- **Karla** — texto general de la interfaz.

Elemento distintivo (firma visual): al marcar un libro como "Terminado", aparece un sello estilo pasaporte con la fecha, con una pequeña animación de sello (rotación + escala), respetando `prefers-reduced-motion` para quien lo tenga activado.

## 5. Punto de partida: prototipo ya construido

Se adjunta `pasaporte_lector.html`, un prototipo funcional construido en Claude.ai con:
- Gestión de varios perfiles (niños) con pestañas tipo pasaporte.
- Tarjetas de libro con carátula, estado, valoración y notas.
- Formulario de añadir libro con buscador de Google Books integrado.
- Filtros por estado.
- Una versión **anterior** de acceso mediante un PIN familiar único compartido — **esto hay que sustituirlo** por el esquema de login por hijo descrito en el punto 3.
- Guardado de datos vía `window.storage` — **esto hay que sustituirlo** por Firebase Firestore.

Es un buen punto de partida de diseño y estructura, pero requiere estas dos migraciones antes de poder publicarse fuera de Claude.ai.

**Estado actual**: el prototipo ya está migrado a ficheros publicables (`index.html`, `styles.css`, `js/`) y el guardado va contra Firestore. Sigue pendiente la migración del acceso (PIN único → login por hijo).

## 6. Modelo de datos y decisiones técnicas

### 6.0 Varias familias y cuentas de verdad (decisión estructural)

La app deja de ser "una familia por proyecto". Todo cuelga de la familia:

```
users/{uid}                    → { familyId, email }
families/{familyId}            → { name, adultUids: [uid], adultPin, createdAt }
families/{familyId}/children/{childId}
                               → { name, code, color, createdAt }
families/{familyId}/children/{childId}/books/{bookId}
                               → { title, author, pages, cover, description,
                                   collection, tags[], status, rating, notes,
                                   addedAt, finishedAt }
```

El `familyId` **es el uid del adulto que creó la familia**. Así las reglas de seguridad
resuelven el caso normal comparando `request.auth.uid` con el `familyId`, sin leer
ningún documento extra en cada comprobación. La consulta a `users/{uid}` solo hace
falta para un segundo adulto invitado, que hoy no existe pero que el modelo ya admite.

El acceso del adulto pasa a ser **Firebase Authentication**, sustituyendo al PIN
familiar único del prototipo.

**Registro**: nombre de la familia + correo electrónico + contraseña + PIN de adulto.
**Inicio de sesión**: correo + contraseña.
**Recuperación**: por correo, con el mecanismo estándar de Firebase.

Se valoró permitir entrar con el **nombre de la familia** en lugar del correo, que es
más cómodo de teclear. Se descartó: Firebase Auth solo autentica con correo, así que
haría falta una tabla pública `nombre → correo` consultable *antes* de iniciar sesión,
y eso expone un correo electrónico a quien acierte el nombre de una familia. Como esa
pantalla se ve **una sola vez por dispositivo** (después Firebase recuerda la sesión) y
los niños no la ven nunca, la comodidad ganada no compensa. De paso desaparece la
necesidad de que los nombres de familia sean únicos: son un simple rótulo.

Si algún día se quisiera el acceso por nombre de familia, es un cambio pequeño y sin
migración de datos: escribir esa tabla y cambiar una pantalla.

**PIN de adulto**: la sesión de Firebase identifica a la *familia*, no al adulto, y el
dispositivo se queda conectado para que los niños puedan usarlo. Por eso la zona de
gestión pide además un PIN de 4 dígitos, guardado en `families/{familyId}.adultPin`.
Sin él, cualquier niño con la tablet podría cambiar códigos o borrar pasaportes.
El registro obliga a definirlo, y el panel avisa si coincide con el código de un hijo.

Los niños **no tienen cuenta**: eligen su tarjeta y teclean su código DDMM dentro de
la sesión ya iniciada de la familia; esa parte sigue siendo una barrera de juguete y
está bien que lo sea.

**Cómo entra un niño** (la duda de "puede haber dos Eduardos en familias distintas"):
el niño nunca elige familia. La familia la determina **la sesión del dispositivo**, no
el niño. El adulto inicia sesión una sola vez en cada tablet o móvil; Firebase recuerda
la sesión indefinidamente, así que a partir de ahí la app abre siempre directamente en
"¿Quién eres?" mostrando **solo los hijos de esa familia**. El niño toca su tarjeta,
teclea su DDMM y entra. Nunca ve el nombre de la familia ni una contraseña.

La pantalla de inicio de sesión solo reaparece si se estrena un dispositivo nuevo o si
el adulto cierra sesión a propósito. Por eso dos Eduardos de familias distintas no
chocan nunca: están en dispositivos distintos, con sesiones distintas.

Esto resuelve además el problema de seguridad que arrastraba el diseño anterior: las
reglas pasan de "cualquiera que sepa el ID del proyecto" a "solo los datos de tu
familia", comprobado en el servidor. Y trae gratis el "he olvidado la contraseña".

Decisiones de alcance tomadas por el usuario:

- **Multi-familia sí, onboarding no.** Se hace el modelo multi-familia desde el
  principio, porque es lo irreversible; la experiencia de alta se queda en un registro
  simple, sin pantallas de bienvenida ni verificación de correo. Si algún día se apunta
  otra familia, funciona.
- **Una sola cuenta de adulto por familia.** No se construye invitación para un segundo
  adulto. Pero `families/{familyId}.adultUids` se guarda **como lista desde ya**, para
  que añadir al segundo padre más adelante no obligue a migrar ningún documento.

Nota: el registro es con cualquier correo electrónico. No se restringe a ningún dominio.

### 6.05 Colecciones, etiquetas y sinopsis

**Colecciones** (una por libro, campo `collection`) para agrupar sagas, y **etiquetas**
(varias por libro, `tags[]`) para lo que el lector quiera. Ambas se filtran desde la
biblioteca.

Se escriben **a mano**. Se comprobó contra la API de Google Books y **no existe ningún
campo de saga o colección**: `categories` devuelve géneros del sector editorial
("Juvenile Fiction") y el `seriesInfo` que aparece en documentación no oficial no viene
en las respuestas reales. Decisión del usuario: la app **no** rellena la colección
automáticamente ni propone los demás libros de la saga; solo registra y filtra.

Para que "Harry Potter" y "harry potter" no acaben siendo dos colecciones distintas, se
agrupan y comparan en minúsculas, pero se muestra el texto tal como se escribió. El
formulario ofrece las colecciones ya usadas como sugerencia al teclear.

**Sinopsis** (`description`): esta sí la da Google Books, en español y de unos 500–800
caracteres, aunque no en todos los libros. Se muestra plegada en los resultados de
búsqueda **antes** de añadir el libro, para poder echarle un ojo, y queda guardada en la
ficha. Se vuelca al formulario para poder editarla o borrarla antes de guardar. Se
limpian las etiquetas HTML, porque algunos registros las traen.

Esto obligó a añadir **edición de libros**, que no existía: sin ella solo se podría
poner colección a los libros nuevos.

### 6.06 El número de páginas es solo informativo (regla del proyecto)

**Nada del comportamiento de la app puede depender de `pages`.** Se muestra en la ficha
y ya está: no condiciona estados, ni validaciones, ni metas, ni insignias.

El motivo es que el dato no es fiable. Google Books devuelve `pageCount: 0` para
ediciones ilustradas, de coleccionista o poco catalogadas — comprobado con la edición
MinaLima de Harry Potter — y cifras dudosas en otras. Cualquier automatismo apoyado en
él se comporta distinto según la edición que se haya elegido en el buscador, que es
imposible de explicar a quien lo usa.

Hubo una versión que marcaba el libro como terminado sola al llegar a la última página.
Se retiró: además de apoyarse en ese dato, cambiaba una casilla sin avisar mientras el
teclado del móvil la tapaba. **Marcar un libro como terminado es siempre una decisión
explícita.**

### 6.07 Peticiones a la biblioteca

Un hijo puede añadir un libro que todavía no tiene y pulsar **"Pedir a la biblioteca"**.
Al adulto le aparece en su panel una lista con el título y **qué hijo lo quiere**, y al
conseguirlo lo marca como hecho.

Se modela como una marca aparte (`reserved`, `reservedAt`), **no** como un cuarto estado
de lectura. Un libro pedido sigue siendo "pendiente": si fuera un estado, al conseguirlo
habría que adivinar a cuál volver, y un libro que ya se está leyendo no podría pedirse.
En pantalla se ve como una insignia bien visible, que es lo que importa a quien lo usa.

La lista del adulto se arma con una escucha por hijo (`where('reserved','==',true)`) en
vez de una consulta global. Con dos o tres hijos el coste es despreciable, y evita tener
que duplicar el `familyId` dentro de cada libro solo para poder filtrar. Sin `orderBy`
a propósito, para no necesitar un índice compuesto: se ordena al mostrarlo, los más
antiguos primero.

### 6.08 Sonido ambiente para leer

Lluvia, mar y bosque, **generados en el navegador** con Web Audio. No se descarga ningún
fichero: el sonido se fabrica a partir de ruido filtrado. Eso resuelve tres cosas a la
vez — no añade peso a la web, no hay licencias de audio que revisar, y el bucle no tiene
costura porque no hay bucle.

Se descartó el ambiente de cafetería: las voces de fondo son justo lo que más distrae al
leer.

Honestidad sobre la calidad: agua es esencialmente ruido con un filtrado concreto, así
que lluvia y mar salen convincentes. El bosque es más difícil porque los pájaros no son
ruido; se sintetizan como silbidos cortos, agradables pero reconocibles como artificiales.

Va en un botón aparte, **no atado al cronómetro**: decisión del usuario, para que poner
música sea siempre una elección y no una sorpresa al empezar a leer. Se calla al salir
del pasaporte.

Limitación conocida: el navegador suspende el audio cuando la página deja de verse, así
que es previsible que se pare al bloquear la pantalla. Si molesta en la práctica, el paso
siguiente es generar el sonido una vez y reproducirlo con un `<audio>` normal, que sí
sigue con la pantalla apagada — sin volver a descargar nada.

### 6.1 Funcionalidades nuevas

Los requisitos 9–12 no son solo interfaz: obligan a ampliar el modelo. Se decide así:

**Sesiones de lectura** (requisito 10). Cada sesión es un documento propio, no un contador dentro del libro:

```
families/{familyId}/children/{childId}/books/{bookId}/sessions/{sessionId}
  → { startedAt, endedAt, minutes, pageFrom, pageTo, day }
```

Guardar sesiones sueltas es lo que hace posibles los retos de minutos y las rachas; un simple total acumulado en el libro no permitiría preguntar "cuántos minutos esta semana". El campo `day` (ISO corto) evita tener que recalcular fechas al agrupar.

El temporizador cronometra con la **marca de tiempo de inicio**, no contando intervalos en JavaScript: si el niño bloquea la tablet o cambia de app, los intervalos se congelan y el tiempo saldría mal. Esa marca vive en `books/{bookId}.activeSince`, así que el cronómetro sobrevive a cerrar la app o recargar, y desde otro dispositivo se ve que ese libro se está leyendo ahora mismo.

Al parar se propone el tiempo del cronómetro pero **se puede corregir**: nadie lee con el cronómetro perfectamente sincronizado. Si han pasado más de 4 horas se avisa, porque es más probable que sea un cronómetro olvidado que una sesión real. También se puede descartar la sesión, y borrar sesiones sueltas del historial.

El libro guarda `currentPage` (marcapáginas, que se propone como página inicial de la siguiente sesión) y además `totalMinutes` y `sessionCount` **duplicados** respecto a las sesiones. Ese duplicado es deliberado y solo de presentación: las metas se calcularán leyendo las sesiones, pero la tarjeta necesita el total para pintarlo y suscribirse a las sesiones de todos los libros solo para eso sería un derroche. Se escribe en el mismo lote que la sesión, así que no pueden desincronizarse.

**Metas e insignias** (requisitos 11–12). Las metas **las fija el adulto**, desde la configuración del perfil de cada niño (detrás del PIN de adulto); el niño las ve y ve su progreso, pero no las cambia. Se guardan como documentos por niño. El progreso se **calcula al vuelo** desde las sesiones y los libros terminados; no se mantiene un contador duplicado, que se desincronizaría. De las insignias sí se guarda la fecha de desbloqueo, para que el momento del logro sea estable y no cambie si luego se corrige una sesión.

**Escaneo de código de barras** (requisito 9). El ISBN tecleado es directo: Google Books acepta `q=isbn:9788412345678`.

Para la cámara se intenta primero la API `BarcodeDetector` del navegador, sin coste añadido. Pero su soporte resultó desigual incluso dentro de Android: se detectó en uso real un Fire tablet cuyo Silk expone la clase `BarcodeDetector` pero cuyo `getSupportedFormats()` devuelve una lista **vacía** — no decodifica ningún tipo de código, ni de barras ni QR. Ese caso concreto es indistinguible de "sin cámara" o "permiso denegado" a simple vista; hizo falta instrumentar el propio escáner para que mostrara en pantalla el motivo técnico exacto (sin cámara, cámara ocupada, permiso denegado, o los formatos que sí soporta) antes de poder diagnosticarlo.

**Decisión revisada tras ese hallazgo**: se añade **ZXing** (`@zxing/library`, ~97 KB comprimidos) como segundo motor, cargado desde CDN **solo cuando el nativo falla o no reconoce los formatos de libro**. Un dispositivo con buen soporte nativo (el caso normal en Android) no descarga nada de más. Esto sustituye la decisión original de no usar ninguna librería externa: aquel supuesto —que el soporte nativo en Android/Fire sería suficiente— no se cumplió en la práctica.

**Corrección tras probarlo en dispositivos reales: el iPhone también escanea.** La limitación real de WebKit era solo la clase `BarcodeDetector`, no el acceso a cámara — Safari sí tiene `getUserMedia` desde hace tiempo. Al dejar de exigir el motor nativo para mostrar el botón (`barcodeAvailable()` ahora solo comprueba contexto seguro + `getUserMedia`), el iPhone cae automáticamente en el camino de ZXing y escanea sin ningún código específico para iOS. Verificado en un iPhone real.

**Recorte digital en vez de zoom de hardware.** Con la cámara bien enfocada pero el código pequeño en el encuadre (detectado en el mismo Fire tablet, una vez el motor ZXing sí llegaba a intentar leer), forzar zoom por la API resultó contraproducente: la API no distingue zoom óptico de digital, y en una tablet sin zoom óptico de verdad eso recorta y estira la imagen, sumando borrosidad justo en las líneas finas del código. Se sustituyó por un recorte de la zona central del fotograma (la que marca el rectángulo guía) ampliado por software sobre un canvas antes de pasarlo al decodificador — funciona igual para los dos motores, y no depende de si el hardware tiene zoom real.

La cámara además exige HTTPS — GitHub Pages lo da, pero abriendo el fichero en local no funciona.

## 7. Tareas pendientes (orden sugerido)

1. ~~Crear proyecto en Firebase (Firestore activado) con la cuenta de Google del usuario.~~ *(guía en `SETUP_FIREBASE.md`; pendiente de que el usuario pegue sus credenciales)*
2. ~~Sustituir las llamadas a `window.storage` por el SDK de Firebase (vía CDN, sin necesidad de npm/build).~~ **Hecho.**
3. ~~Implementar la pantalla "¿Quién eres?" + código por cumpleaños + acceso de adulto con PIN, sustituyendo el PIN único actual.~~ **Hecho**, junto con el modelo multi-familia y las cuentas de Firebase Authentication.
4. ~~Añadir libro por ISBN tecleado.~~ **Hecho.** El buscador detecta si lo tecleado es un ISBN (con verificación del dígito de control) y consulta `q=isbn:...`.
5. ~~Escaneo de código de barras con cámara.~~ **Hecho**, con `BarcodeDetector`. Pendiente de probar en un dispositivo real con cámara.
6. ~~Temporizador de lectura + sesiones + marcapáginas.~~ **Hecho.**
7. Metas e insignias (dependen de que existan sesiones). **Siguiente.**
8. ~~Verificar el comportamiento en los tres dispositivos.~~ Probado en iPhone y tablet Android, instalada como app en ambos. Falta la Fire.
9. ~~Subir el proyecto a GitHub y activar GitHub Pages.~~ **Hecho**: https://jmorecru.github.io/pasaporte-lector/
10. Probar el flujo completo con cada hijo desde su propio dispositivo.

## 8. Fuera de alcance (decidido explícitamente)

- No se construye app nativa (APK) — no cubriría iOS y no se dispone de herramientas de firma/compilación.
- No se usan Beanstack, StoryKeeper ni otras apps externas — se evaluaron y se descartaron (restricciones geográficas y límites de plan gratuito, respectivamente).
