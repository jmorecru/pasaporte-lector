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
  orderBy,
  writeBatch
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
