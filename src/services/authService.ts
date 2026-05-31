/**
 * src/services/authService.ts
 *
 * FIX #3 — Al signup il campo uid nel documento Firestore deve corrispondere
 *           all'UID reale di Firebase Auth (verificato anche nelle rules).
 *
 * FIX #5 — Al signup devices deve essere un array vuoto [].
 *           Le rules ora rifiutano documenti con devices non vuoto in create.
 *
 * NOTA: createdAt viene aggiunto con serverTimestamp() per coerenza
 *       col blueprint, anche se le rules non lo richiedono.
 */

import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User,
  updateProfile,
} from "firebase/auth";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
} from "firebase/firestore";

const auth = getAuth();
const db = getFirestore();

// ─── Tipi ─────────────────────────────────────────────────────────────────────

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string | null;
  createdAt: ReturnType<typeof serverTimestamp>;
  devices: string[];
}

// ─── signup ───────────────────────────────────────────────────────────────────

/**
 * Crea un nuovo account e il relativo profilo Firestore.
 *
 * FIX #3: uid nel documento = auth.currentUser.uid (garantito dal codice,
 *         verificato anche dalla rule `request.resource.data.uid == request.auth.uid`)
 * FIX #5: devices è sempre [] alla creazione
 */
export async function signup(
  email: string,
  password: string,
  displayName?: string
): Promise<User> {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  const user = credential.user;

  // Aggiorna il display name su Firebase Auth (opzionale)
  if (displayName) {
    await updateProfile(user, { displayName });
  }

  // Crea il documento Firestore — uid = user.uid garantisce coerenza
  const userRef = doc(db, "users", user.uid);
  const profile: UserProfile = {
    uid: user.uid,          // FIX #3: corrisponde all'UID Auth reale
    email: user.email!,
    displayName: displayName ?? null,
    createdAt: serverTimestamp() as ReturnType<typeof serverTimestamp>,
    devices: [],            // FIX #5: sempre vuoto al signup
  };

  await setDoc(userRef, profile);
  return user;
}

// ─── login / logout ───────────────────────────────────────────────────────────

export async function login(email: string, password: string): Promise<User> {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential.user;
}

export async function logout(): Promise<void> {
  await signOut(auth);
}

// ─── getUserProfile ───────────────────────────────────────────────────────────

/**
 * Legge il profilo Firestore dell'utente corrente.
 * Restituisce null se il documento non esiste ancora.
 */
export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return null;
  return snap.data() as UserProfile;
}

// ─── onAuthChanged ────────────────────────────────────────────────────────────

export function onAuthChanged(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}
