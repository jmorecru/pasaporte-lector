# 📖 Pasaporte Lector

Aplicación web para que cada niño de la familia lleve el registro de los libros que va
leyendo. Cada libro terminado deja un sello, como en un pasaporte.

Hecha para uso familiar, sin frameworks ni herramientas de compilación: HTML, CSS y
JavaScript con módulos ES que el navegador carga directamente.

## Qué hace

- Un pasaporte por hijo, con su propio código de acceso.
- Zona de gestión para el adulto, protegida con PIN.
- Búsqueda de libros contra Google Books: título, autor, páginas, carátula y sinopsis.
- Estados pendiente / leyendo / terminado, con sello y fecha al terminar.
- Valoración por estrellas y notas.
- Colecciones y etiquetas propias, con filtros.
- Sincronización en tiempo real entre dispositivos.

## Cómo funciona por dentro

- **Datos y cuentas**: Firebase (Firestore + Authentication), vía CDN.
- **Hosting**: GitHub Pages.
- **Catálogo**: API pública de Google Books.

## Ponerlo en marcha

Necesitas un proyecto propio de Firebase. El paso a paso está en
[SETUP_FIREBASE.md](SETUP_FIREBASE.md).

Para desarrollar en local:

```bash
python dev-server.py
```

Y abrir http://localhost:8000. No sirve abrir `index.html` con doble clic: los módulos
ES necesitan un servidor.

## Documentación del proyecto

- [BRIEF_pasaporte_lector.md](BRIEF_pasaporte_lector.md) — requisitos, decisiones de
  diseño y modelo de datos, con el porqué de cada decisión.
- [SETUP_FIREBASE.md](SETUP_FIREBASE.md) — configuración de Firebase y Google Books.
- [PENDIENTES.md](PENDIENTES.md) — tareas de configuración y limpieza pendientes.

## Sobre la seguridad

Las claves de `js/firebase-config.js` son públicas por diseño: van en el HTML de
cualquier aplicación web de Firebase. Lo que protege los datos son las reglas de
[firestore.rules](firestore.rules), que exigen sesión iniciada y limitan cada familia a
sus propios datos.

Los códigos de los niños y el PIN de adulto son una barrera para evitar curiosidad entre
hermanos, no seguridad de nivel profesional: viajan al navegador y alguien que sepa
abrir las herramientas de desarrollo puede verlos.
