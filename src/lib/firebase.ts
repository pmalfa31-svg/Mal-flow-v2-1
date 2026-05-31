import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  signInWithEmailAndPassword as firebaseSignInWithEmail,
  createUserWithEmailAndPassword as firebaseCreateUserWithEmail,
  updateProfile,
  User
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  limit,
  arrayUnion,
  arrayRemove,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const googleProvider = new GoogleAuthProvider();

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  createdAt: any;
  devices: string[];
}

export interface MemberProfile {
  uid: string;
  email: string;
  displayName: string;
  role: 'owner' | 'viewer';
  devices: string[];
  addedAt: any;
}

export interface DeviceData {
  id: string;
  name: string;
  batteryVoltage: number;
  currentFlow: number;
  temperature: number;
  pressure: number;
  humidity: number;
  lastUpdate: any;
  claimedAt: any;
  settings?: {
    notificationsEnabled: boolean;
    emailAlerts: boolean;
    dailyThreshold: number;
    leakThreshold: number;
    nightStart: string;
    nightEnd: string;
  };
}

// ─── Error Handler ────────────────────────────────────────────────────────────

export interface FirestoreErrorInfo {
  error: string;
  operationType: 'create' | 'update' | 'delete' | 'list' | 'get' | 'write';
  path: string | null;
}

export function handleFirestoreError(
  error: any,
  operationType: FirestoreErrorInfo['operationType'],
  path: string | null = null
): never {
  const errorInfo: FirestoreErrorInfo = {
    error: error.message || 'Unknown Firestore error',
    operationType,
    path
  };
  throw new Error(JSON.stringify(errorInfo));
}

// ─── Auth Helpers ─────────────────────────────────────────────────────────────

const createUserDoc = async (user: User, displayName?: string) => {
  const userRef = doc(db, 'users', user.uid);
  const snap = await getDoc(userRef);
  if (!snap.exists()) {
    await setDoc(userRef, {
      uid: user.uid,
      email: user.email,
      displayName: displayName || user.displayName || '',
      createdAt: serverTimestamp(),
      devices: []
    });
  }
};

export const loginWithGoogle = async () => {
  const result = await signInWithPopup(auth, googleProvider);
  await createUserDoc(result.user);
  return result.user;
};

export const loginWithEmail = async (email: string, pass: string) => {
  const result = await firebaseSignInWithEmail(auth, email, pass);
  return result.user;
};

export const signUpWithEmail = async (email: string, pass: string, name: string) => {
  const result = await firebaseCreateUserWithEmail(auth, email, pass);
  await updateProfile(result.user, { displayName: name });
  await createUserDoc(result.user, name);
  return result.user;
};

export const logout = () => signOut(auth);

// ─── Device Helpers ───────────────────────────────────────────────────────────

export const getUserProfile = async (uid: string): Promise<UserProfile | null> => {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? (snap.data() as UserProfile) : null;
};

/**
 * FIX — pairDevice
 *
 * Problema originale: il codice faceva getDoc sul device PRIMA di aggiungerlo
 * all'array dell'utente. Le rules bloccavano il getDoc perché l'utente non
 * aveva ancora il device nel suo profilo (userOwnsDevice = false).
 *
 * Soluzione: l'ordine delle operazioni è ora:
 *   1. Controlla che il device esista usando getDocs sulla collezione
 *      devices con query sull'id — oppure semplicemente tenta l'arrayUnion
 *      sull'utente prima (operazione sempre permessa su se stessi).
 *   2. Aggiungi il deviceId all'array dell'utente (PRIMO — sblocca le rules).
 *   3. Ora userOwnsDevice = true → leggi il device per verificare claimedAt.
 *   4. Se non era ancora claimed, imposta claimedAt.
 */
export const pairDevice = async (uid: string, deviceId: string): Promise<void> => {
  const cleanId = deviceId.trim();
  const deviceRef = doc(db, 'devices', cleanId);
  const userRef = doc(db, 'users', uid);

  // STEP 1 — Aggiungi subito il deviceId all'array dell'utente.
  // Questo è permesso dalle rules (l'utente scrive su se stesso).
  // Da questo momento userOwnsDevice(cleanId) = true per questo utente.
  await updateDoc(userRef, {
    devices: arrayUnion(cleanId)
  });

  // STEP 2 — Ora che l'utente "possiede" il device, possiamo leggerlo.
  // Se il device non esiste in Firestore, lo segnaliamo e facciamo rollback.
  let deviceSnap;
  try {
    deviceSnap = await getDoc(deviceRef);
  } catch (e) {
    // Rollback: rimuovi il deviceId dall'array se la lettura fallisce
    await updateDoc(userRef, { devices: arrayRemove(cleanId) });
    throw new Error('DEVICE_NOT_FOUND');
  }

  if (!deviceSnap.exists()) {
    // Rollback: device non esiste, rimuovilo dall'array
    await updateDoc(userRef, { devices: arrayRemove(cleanId) });
    throw new Error('DEVICE_NOT_FOUND');
  }

  // STEP 3 — Imposta claimedAt solo se il device non era ancora claimed.
  // Le rules permettono questa scrittura solo se claimedAt era null (Fix #1).
  const data = deviceSnap.data() as DeviceData;
  if (!data.claimedAt) {
    await updateDoc(deviceRef, { claimedAt: serverTimestamp() });
  }
};

export const unpairDevice = async (uid: string, deviceId: string): Promise<void> => {
  await updateDoc(doc(db, 'users', uid), {
    devices: arrayRemove(deviceId)
  });
};

// ─── Member (Family) Helpers ──────────────────────────────────────────────────

/**
 * FIX — sharDeviceWithMember
 *
 * Il vecchio codice faceva updateDoc su /users/{memberUid} direttamente
 * dal client, operazione bloccata dalle rules (non puoi scrivere nel
 * profilo di un altro utente). Ora usa la Cloud Function shareDevice
 * che usa Admin SDK server-side.
 *
 * Importa shareDeviceWithMember da sharingService.ts invece di questa.
 */
export const sharDeviceWithMember = async (
  ownerUid: string,
  deviceId: string,
  memberEmail: string
): Promise<void> => {
  // Questa funzione è mantenuta per compatibilità ma internamente
  // dovrebbe chiamare la Cloud Function. Usa sharingService.ts direttamente.
  throw new Error(
    'Usa shareDeviceWithMember() da sharingService.ts — ' +
    'questa funzione non può scrivere nel profilo di un altro utente dal client.'
  );
};

export const removeMember = async (
  ownerUid: string,
  memberUid: string,
  ownerDevices: string[]
): Promise<void> => {
  const memberRef = doc(db, 'users', ownerUid, 'members', memberUid);
  const memberSnap = await getDoc(memberRef);
  if (!memberSnap.exists()) return;

  await updateDoc(doc(db, 'users', memberUid), {
    devices: arrayRemove(...ownerDevices)
  });

  await updateDoc(memberRef, { devices: [] });
};

export const getMembers = async (ownerUid: string): Promise<MemberProfile[]> => {
  const membersRef = collection(db, 'users', ownerUid, 'members');
  const snap = await getDocs(membersRef);
  return snap.docs.map(d => d.data() as MemberProfile);
};