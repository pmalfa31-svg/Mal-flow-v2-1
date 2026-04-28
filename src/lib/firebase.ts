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
  devices: string[]; // array of device IDs e.g. ["MF-A3F9", "MF-B7K2"]
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
      devices: [] // empty — user will pair their device later
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

/**
 * Get the user's profile doc (includes devices array)
 */
export const getUserProfile = async (uid: string): Promise<UserProfile | null> => {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? (snap.data() as UserProfile) : null;
};

/**
 * Pair a device: verify it exists in Firestore (pre-created by ESP32),
 * then add the deviceId to the user's devices array.
 * Sets claimedAt on the device if it was unclaimed.
 */
export const pairDevice = async (uid: string, deviceId: string): Promise<void> => {
  const deviceRef = doc(db, 'devices', deviceId.trim());
  const deviceSnap = await getDoc(deviceRef);

  if (!deviceSnap.exists()) {
    throw new Error('DEVICE_NOT_FOUND');
  }

  const data = deviceSnap.data() as DeviceData;

  // Mark as claimed if first pairing
  if (!data.claimedAt) {
    await updateDoc(deviceRef, { claimedAt: serverTimestamp() });
  }

  // Add deviceId to user's array
  await updateDoc(doc(db, 'users', uid), {
    devices: arrayUnion(deviceId.trim())
  });
};

/**
 * Unpair a device: remove it from the user's devices array.
 * Does NOT touch the device document itself — ESP32 keeps sending data.
 */
export const unpairDevice = async (uid: string, deviceId: string): Promise<void> => {
  await updateDoc(doc(db, 'users', uid), {
    devices: arrayRemove(deviceId)
  });
};

// ─── Member (Family) Helpers ──────────────────────────────────────────────────

/**
 * Share a device with a family member by email.
 * Creates a member sub-doc under the owner's user doc,
 * and adds the deviceId to the member's own devices array.
 */
export const sharDeviceWithMember = async (
  ownerUid: string,
  deviceId: string,
  memberEmail: string
): Promise<void> => {
  // 1. Find target user by email
  const usersRef = collection(db, 'users');
  const q = query(usersRef, where('email', '==', memberEmail), limit(1));
  const qSnap = await getDocs(q);

  if (qSnap.empty) {
    throw new Error('USER_NOT_FOUND');
  }

  const memberData = qSnap.docs[0].data() as UserProfile;

  if (memberData.uid === ownerUid) {
    throw new Error('CANNOT_ADD_YOURSELF');
  }

  // 2. Create member entry under owner's subcollection
  const memberRef = doc(db, 'users', ownerUid, 'members', memberData.uid);
  await setDoc(memberRef, {
    uid: memberData.uid,
    email: memberData.email,
    displayName: memberData.displayName || '',
    role: 'viewer',
    devices: arrayUnion(deviceId),
    addedAt: serverTimestamp()
  }, { merge: true }); // merge so existing members just get the new device added

  // 3. Add the deviceId to the member's own devices array so rules allow access
  await updateDoc(doc(db, 'users', memberData.uid), {
    devices: arrayUnion(deviceId)
  });
};

/**
 * Remove a family member's access to all owner's devices.
 */
export const removeMember = async (
  ownerUid: string,
  memberUid: string,
  ownerDevices: string[]
): Promise<void> => {
  // 1. Delete the member subdoc
  const memberRef = doc(db, 'users', ownerUid, 'members', memberUid);
  const memberSnap = await getDoc(memberRef);
  if (!memberSnap.exists()) return;

  // 2. Remove all of the owner's devices from the member's devices array
  await updateDoc(doc(db, 'users', memberUid), {
    devices: arrayRemove(...ownerDevices)
  });

  // 3. Delete the member subdoc
  await updateDoc(memberRef, { devices: [] }); // clear first to be safe
  // Note: use deleteDoc from 'firebase/firestore' at call site if preferred
};

/**
 * Fetch all members for an owner
 */
export const getMembers = async (ownerUid: string): Promise<MemberProfile[]> => {
  const membersRef = collection(db, 'users', ownerUid, 'members');
  const snap = await getDocs(membersRef);
  return snap.docs.map(d => d.data() as MemberProfile);
};
