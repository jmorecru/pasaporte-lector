// Capa de datos y de acceso: todo lo que toca Firebase vive aquí.
// El resto de la app no importa nada de Firebase directamente.
//
// Modelo en Firestore:
//   users/{uid}                        → { familyId, email }
//   families/{familyId}                → { name, adultUids[], adultPin, createdAt }
//   families/{familyId}/children/{childId}
//                                      → { name, code, color, createdAt }
//   families/{familyId}/children/{childId}/books/{bookId}
//                                      → { title, author, pages, cover, status,
//                                          rating, notes, addedAt, finishedAt }
//
// El identificador de la familia es el uid del adulto que la creó. Eso permite que
// las reglas de seguridad resuelvan el caso normal comparando `request.auth.uid`
// con el familyId, sin leer ningún documento extra. `adultUids` se guarda como
// lista desde el principio para poder añadir un segundo adulto más adelante sin
// migrar nada.
//
// Para actualizar la versión del SDK, cambia el número en las tres URLs de abajo.

import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  onAuthStateChanged,
  signOut
} from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  getFirestore,
  collection,
  doc,
  getDoc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  onSnapshot,
  query,
  where,
  orderBy,
  writeBatch,
  increment
} from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js';

import { firebaseConfig } from './firebase-config.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Caché local persistente: la app sigue mostrando los libros sin cobertura y
// sincroniza al recuperar red. Si el navegador lo bloquea (modo privado de
// Safari, por ejemplo), caemos a Firestore sin persistencia.
let db;
try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
  });
} catch (e) {
  console.warn('Sin caché persistente, se usa Firestore en memoria.', e);
  db = getFirestore(app);
}

// ---- Rutas ----

const userDoc = uid => doc(db, 'users', uid);
const familyDoc = familyId => doc(db, 'families', familyId);
const childrenCol = familyId => collection(db, 'families', familyId, 'children');
const childDoc = (familyId, childId) => doc(db, 'families', familyId, 'children', childId);
const booksCol = (familyId, childId) =>
  collection(db, 'families', familyId, 'children', childId, 'books');
const bookDoc = (familyId, childId, bookId) =>
  doc(db, 'families', familyId, 'children', childId, 'books', bookId);

// ---- Acceso del adulto ----

/**
 * Avisa cada vez que se inicia o se cierra sesión, y una vez al arrancar con la
 * sesión recordada del dispositivo (o con null si no hay ninguna).
 * @returns {() => void} función para cancelar la suscripción.
 */
export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}

export function currentUser() {
  return auth.currentUser;
}

/**
 * Registra al adulto y crea su familia en la misma operación.
 * El id de la familia es el uid del adulto.
 */
export async function register({ email, password, familyName, adultPin }) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  const uid = cred.user.uid;
  await setDoc(familyDoc(uid), {
    name: familyName,
    adultUids: [uid],
    adultPin,
    createdAt: Date.now()
  });
  await setDoc(userDoc(uid), { familyId: uid, email });
  return uid;
}

export async function login({ email, password }) {
  await signInWithEmailAndPassword(auth, email, password);
}

export async function logout() {
  await signOut(auth);
}

export async function sendPasswordReset(email) {
  await sendPasswordResetEmail(auth, email);
}

/** Devuelve el familyId del usuario conectado, o null si su ficha no existe. */
export async function getFamilyId(uid) {
  const snap = await getDoc(userDoc(uid));
  return snap.exists() ? snap.data().familyId : null;
}

export async function getFamily(familyId) {
  const snap = await getDoc(familyDoc(familyId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function updateFamily(familyId, changes) {
  await updateDoc(familyDoc(familyId), changes);
}

// ---- Niños ----

/**
 * Escucha la lista de niños de la familia en tiempo real.
 * @returns {() => void} función para cancelar la suscripción.
 */
export function subscribeChildren(familyId, onChange, onError) {
  const q = query(childrenCol(familyId), orderBy('createdAt', 'asc'));
  return onSnapshot(
    q,
    snap => onChange(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    err => { console.error('Error escuchando niños', err); onError && onError(err); }
  );
}

export async function addChild(familyId, { name, code, color }) {
  const ref = await addDoc(childrenCol(familyId), {
    name,
    code,
    color: color || null,
    createdAt: Date.now()
  });
  return ref.id;
}

export async function updateChild(familyId, childId, changes) {
  await updateDoc(childDoc(familyId, childId), changes);
}

/**
 * Escucha un único niño en tiempo real: hace falta además de
 * `subscribeChildren` porque `minutesByDay` (metas y rachas) e insignias
 * necesitan reaccionar al instante cuando cambian, y suscribirse a todos los
 * niños de la familia para ver el detalle de uno solo sería un derroche.
 * @returns {() => void} función para cancelar la suscripción.
 */
export function subscribeChild(familyId, childId, onChange, onError) {
  return onSnapshot(
    childDoc(familyId, childId),
    snap => onChange(snap.exists() ? { id: snap.id, ...snap.data() } : null),
    err => { console.error('Error escuchando al niño', err); onError && onError(err); }
  );
}

/** Metas de lectura configuradas por el adulto. Cualquier campo puede quedar sin fijar. */
export async function updateChildGoals(familyId, childId, goals) {
  await updateDoc(childDoc(familyId, childId), { goals });
}

/** Borra el niño y todos sus libros: Firestore no borra subcolecciones solo. */
export async function deleteChild(familyId, childId) {
  const books = await getDocs(booksCol(familyId, childId));
  // Un batch admite 500 operaciones; troceamos por si algún niño tiene muchos libros.
  for (let i = 0; i < books.docs.length; i += 400) {
    const batch = writeBatch(db);
    books.docs.slice(i, i + 400).forEach(d => batch.delete(d.ref));
    await batch.commit();
  }
  await deleteDoc(childDoc(familyId, childId));
}

// ---- Libros ----

/**
 * Escucha los libros de un niño, del más reciente al más antiguo.
 * @returns {() => void} función para cancelar la suscripción.
 */
export function subscribeBooks(familyId, childId, onChange, onError) {
  const q = query(booksCol(familyId, childId), orderBy('addedAt', 'desc'));
  return onSnapshot(
    q,
    snap => onChange(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    err => { console.error('Error escuchando libros', err); onError && onError(err); }
  );
}

export async function addBook(familyId, childId, book) {
  const ref = await addDoc(booksCol(familyId, childId), book);
  return ref.id;
}

export async function updateBook(familyId, childId, bookId, changes) {
  await updateDoc(bookDoc(familyId, childId, bookId), changes);
}

export async function deleteBook(familyId, childId, bookId) {
  await deleteDoc(bookDoc(familyId, childId, bookId));
}

/**
 * Escucha los libros que un niño ha pedido reservar en la biblioteca.
 *
 * Se consulta niño a niño en vez de con una consulta global sobre todos los
 * libros de la familia: con dos o tres hijos son dos o tres escuchas pequeñas,
 * y evita tener que duplicar el familyId dentro de cada libro solo para poder
 * filtrar. Sin `orderBy` a propósito, para no necesitar un índice compuesto;
 * el orden se pone al mostrarlo.
 * @returns {() => void} función para cancelar la suscripción.
 */
export function subscribeReservedBooks(familyId, childId, onChange, onError) {
  const q = query(booksCol(familyId, childId), where('reserved', '==', true));
  return onSnapshot(
    q,
    snap => onChange(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    err => { console.error('Error escuchando reservas', err); onError && onError(err); }
  );
}

// ---- Sesiones de lectura ----
//
// Cada sesión es un documento propio. Es lo que permitirá preguntar "cuántos
// minutos ha leído esta semana" cuando lleguen las metas; con un simple total
// acumulado no se podría.
//
// Aun así, el libro guarda `totalMinutes` y `sessionCount` duplicados. No es
// incoherencia: las metas se calcularán leyendo las sesiones, pero la tarjeta
// necesita el total al vuelo y suscribirse a las sesiones de todos los libros
// del niño solo para pintarlo sería un derroche. El duplicado es para mostrar.

const sessionsCol = (familyId, childId, bookId) =>
  collection(db, 'families', familyId, 'children', childId, 'books', bookId, 'sessions');

/**
 * Escucha las sesiones de un libro, de la más reciente a la más antigua.
 * Solo se usa al desplegar el historial de un libro concreto.
 * @returns {() => void} función para cancelar la suscripción.
 */
export function subscribeSessions(familyId, childId, bookId, onChange, onError) {
  const q = query(sessionsCol(familyId, childId, bookId), orderBy('endedAt', 'desc'));
  return onSnapshot(
    q,
    snap => onChange(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    err => { console.error('Error escuchando sesiones', err); onError && onError(err); }
  );
}

/**
 * Guarda una sesión terminada y actualiza el libro en una sola operación:
 * suma los minutos, avanza el marcapáginas y apaga el cronómetro. De paso
 * suma esos minutos al día correspondiente en `children/{childId}.minutesByDay`
 * — un mapa `{ 'YYYY-MM-DD': minutos }` en el propio niño, no en las
 * sesiones. Es lo que permite calcular metas de "minutos hoy" o "minutos esta
 * semana" y rachas de días leyendo sin tener que consultar todas las sesiones
 * de todos los libros a la vez (que en Firestore exigiría una collection
 * group query y unas reglas de seguridad más difíciles de razonar). El mapa
 * no se recorta: incluso años de un dato al día pesa un puñado de KB, muy
 * lejos del límite de un documento.
 * Al ir todo en un lote, o se aplica entero o no se aplica nada.
 */
export async function endSession(familyId, childId, bookId, session, bookChanges) {
  const batch = writeBatch(db);
  batch.set(doc(sessionsCol(familyId, childId, bookId)), session);
  batch.update(bookDoc(familyId, childId, bookId), bookChanges);
  // La clave del nivel superior lleva el punto literal ("minutesByDay.2026-08-07"),
  // no un objeto anidado: es la notación de Firestore para tocar una sola
  // clave de un mapa sin arriesgarse a si {merge:true} fusiona o sobrescribe
  // el mapa entero cuando se le pasa un objeto parcial. Con la notación de
  // punto no hay ambigüedad posible: solo se toca esa clave.
  batch.set(childDoc(familyId, childId), {
    [`minutesByDay.${session.day}`]: increment(session.minutes)
  }, { merge: true });
  await batch.commit();
}

export async function deleteSession(familyId, childId, bookId, sessionId, bookChanges) {
  const batch = writeBatch(db);
  batch.delete(doc(sessionsCol(familyId, childId, bookId), sessionId));
  batch.update(bookDoc(familyId, childId, bookId), bookChanges);
  await batch.commit();
}

// ---- Insignias ----
//
// Una insignia es un documento por logro conseguido, con la clave fija del
// catálogo (ver js/achievements.js) como id del documento — así comprobar si
// ya está desbloqueada es una simple consulta por id, sin duplicados
// posibles. Se guarda la fecha de desbloqueo para que el momento del logro
// quede fijo: si más tarde se corrige una sesión antigua, un logro ya
// celebrado no debe "desconcederse".

const badgesCol = (familyId, childId) =>
  collection(db, 'families', familyId, 'children', childId, 'badges');

/**
 * Escucha las insignias ya desbloqueadas de un niño.
 * @returns {() => void} función para cancelar la suscripción.
 */
export function subscribeBadges(familyId, childId, onChange, onError) {
  return onSnapshot(
    badgesCol(familyId, childId),
    snap => onChange(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    err => { console.error('Error escuchando insignias', err); onError && onError(err); }
  );
}

export async function unlockBadge(familyId, childId, badgeKey) {
  await setDoc(doc(badgesCol(familyId, childId), badgeKey), { unlockedAt: Date.now() });
}

/**
 * Borra todas las insignias ya desbloqueadas de un niño, para volver a
 * empezar de cero. No toca libros ni sesiones: si las condiciones de fondo
 * (libros terminados, minutos acumulados...) siguen cumpliéndose, esas
 * insignias se desbloquearán solas de nuevo la próxima vez que se abra su
 * biblioteca — no hay forma de "posponer" un logro que ya es cierto.
 */
export async function resetBadges(familyId, childId) {
  const snap = await getDocs(badgesCol(familyId, childId));
  const batch = writeBatch(db);
  snap.docs.forEach(d => batch.delete(d.ref));
  await batch.commit();
}
