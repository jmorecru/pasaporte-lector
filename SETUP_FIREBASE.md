# Crear el proyecto de Firebase (paso 1 del brief)

Esto hay que hacerlo desde el navegador con tu cuenta de Google. Son unos 5 minutos.
Al terminar, la app ya guarda y sincroniza datos de verdad.

## 1. Crear el proyecto

1. Entra en https://console.firebase.google.com con tu cuenta de Google.
2. **Crear un proyecto** (o *Add project*).
3. Nombre: `pasaporte-lector` (Firebase le añadirá un sufijo si está ocupado).
4. Google Analytics: **desactívalo**. No aporta nada aquí y simplifica la configuración.
5. **Crear proyecto** y espera a que termine.

## 2. Activar Firestore

1. En el menú lateral: **Compilación → Firestore Database**.
2. **Crear base de datos**.
3. Ubicación: **`eur3 (europe-west)`** o `europe-west1`. Elige bien: **no se puede
   cambiar después**.
4. Modo: elige **modo de prueba**. Da igual cuál marques ahora, porque en el paso 4
   vamos a sustituir las reglas por las del repositorio.

## 3. Registrar la app web y copiar la configuración

1. En **⚙ Configuración del proyecto** (rueda dentada arriba a la izquierda).
2. Baja hasta **Tus apps** y pulsa el icono **`</>`** (Web).
3. Alias de la app: `pasaporte-lector-web`. **No** marques "Firebase Hosting"
   (el hosting va en GitHub Pages).
4. **Registrar app**. Firebase te muestra un bloque de código con un objeto
   `firebaseConfig` así:

   ```js
   const firebaseConfig = {
     apiKey: "AIzaSy...",
     authDomain: "pasaporte-lector.firebaseapp.com",
     projectId: "pasaporte-lector",
     storageBucket: "pasaporte-lector.firebasestorage.app",
     messagingSenderId: "123456789012",
     appId: "1:123456789012:web:abc123"
   };
   ```

5. Copia esos seis valores en [js/firebase-config.js](js/firebase-config.js),
   sustituyendo los `PEGA_AQUI...`.

> Estas claves **no son secretas**: van en el HTML de cualquier app web de Firebase
> y son públicas por diseño. Quien protege los datos son las reglas de Firestore.

## 3bis. Activar el acceso con correo y contraseña

1. Menú lateral → **Authentication** → **Comenzar**.
2. Pestaña **Sign-in method** → **Correo electrónico/contraseña** → **Habilitar** →
   **Guardar**. Deja desactivada la segunda opción ("vínculo de correo sin contraseña").

No hace falta habilitar "Acceder con Google": el acceso con Google en web usa ventanas
emergentes y redirecciones que Safari de iPhone bloquea por su protección antirrastreo,
y el requisito 7 pide comportamiento idéntico en Safari, Chrome y Silk. Correo y
contraseña es un formulario normal y se comporta igual en los tres.

## 4. Publicar las reglas de seguridad

1. **Firestore Database → pestaña Reglas**.
2. Borra lo que haya y pega el contenido de [firestore.rules](firestore.rules).
3. **Publicar**.

Importante: el "modo de prueba" por defecto **caduca a los 30 días** y entonces la app
deja de funcionar sin avisar. Las reglas del repositorio no caducan, por eso este paso
no es opcional.

## 5. Probar en local

Los módulos ES no funcionan abriendo el archivo con doble clic (`file://`); hace falta
un servidor. Con Python, que ya tienes instalado:

```powershell
python dev-server.py
```

Y abre http://localhost:8000 en el navegador.

Usa `dev-server.py` y no `python -m http.server`: es lo mismo pero pidiendo al navegador
que no cachee nada. Los ficheros de `js/` son módulos ES y el navegador se aferra a ellos
con mucha insistencia; sin esa cabecera acabas viendo código viejo tras cada cambio y
buscando fallos que ya estaban arreglados.

Comprobaciones:

- [ ] La app pide crear un PIN familiar de 4 dígitos.
- [ ] Puedes crear un niño y añadirle un libro (con el buscador de Google Books).
- [ ] En la consola de Firebase, **Firestore Database → Datos**, aparecen las
      colecciones `children` y `config`.
- [ ] Abre `http://localhost:8000` en una segunda pestaña: al marcar un libro como
      terminado en una, la otra se actualiza sola. Esa es la sincronización en tiempo real.

## 6. Buscador de libros: clave de Google Books (necesaria)

La app busca libros contra la API de Google Books. Sin clave, Google mete **todas** las
peticiones anónimas del mundo en una única cuota compartida, y esa cuota está agotada
de forma crónica: las búsquedas devuelven `HTTP 429`. Se comprobó desde dos redes
distintas (corporativa y doméstica) con el mismo resultado, así que no es cuestión de
cambiar de conexión ni de esperar.

Con una clave propia la cuota es tuya: 1.000 consultas al día gratis, de sobra.

1. Ve a https://console.cloud.google.com y arriba selecciona el proyecto
   **pasaporte-lector** (es el mismo que creó Firebase).
2. **APIs y servicios → Biblioteca**, busca **Books API** y pulsa **Habilitar**.
3. **APIs y servicios → Credenciales → Crear credenciales → Clave de API**.
4. Copia la clave y pégala en `googleBooksApiKey`, en
   [js/firebase-config.js](js/firebase-config.js).
5. Recomendable: pulsa **Editar** en esa clave y restríngela.
   - *Restricciones de API* → solo **Books API**.
   - *Restricciones de aplicación* → **Sitios web**, añadiendo `localhost:8000` y el
     dominio de GitHub Pages cuando lo tengas.

Crea una clave **nueva**; no reutilices la de `apiKey` del bloque de Firebase. Si le
pones restricciones a esa, puedes dejar la app entera sin acceso a Firestore.

## 7. Autorizar el dominio de GitHub Pages (cuando publiques)

Cuando actives GitHub Pages, añade su dominio en **Configuración del proyecto →
Authentication → Settings → Dominios autorizados**, o (si no usas Authentication)
simplemente comprueba que la app funciona desde la URL publicada. Firestore no
restringe por dominio salvo que lo configures tú en las restricciones de la clave API
en Google Cloud.

---

## Estructura de datos en Firestore

```
users/{uid}                       → { familyId, email }
families/{familyId}               → { name, adultUids[], adultPin, createdAt }
families/{familyId}/children/{childId}
                                  → { name, code, color, createdAt }
families/{familyId}/children/{childId}/books/{bookId}
                                  → { title, author, pages, cover,
                                      status, rating, notes,
                                      addedAt, finishedAt }
```

`status` es `pendiente` | `leyendo` | `terminado`.
`addedAt` es epoch en milisegundos; `finishedAt` es `YYYY-MM-DD` o `null`.
`code` es el DDMM del cumpleaños del niño.
El `familyId` es el uid del adulto que creó la familia.
