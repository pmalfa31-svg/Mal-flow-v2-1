/**
 * src/services/sharingService.ts
 *
 * FIX #2 — Flusso di condivisione device con un member.
 *
 * Il vecchio codice probabilmente faceva qualcosa del tipo:
 *
 *   await updateDoc(doc(db, 'users', memberUid), {
 *     devices: arrayUnion(...deviceIds)
 *   });
 *
 * Questo veniva BLOCCATO silenziosamente dalle Firestore rules
 * (non puoi scrivere nel profilo di un altro utente da client).
 *
 * La nuova implementazione chiama le Callable Functions `shareDevice`
 * e `removeMember` che usano Admin SDK server-side.
 */

import { getFunctions, httpsCallable } from "firebase/functions";

const functions = getFunctions(undefined, "europe-west1");

// ─── Tipi ─────────────────────────────────────────────────────────────────────

export interface ShareDeviceParams {
  memberEmail: string;
  deviceIds: string[];
}

export interface ShareDeviceResult {
  success: boolean;
  memberUid: string;
  sharedDevices: string[];
}

export interface RemoveMemberParams {
  memberUid: string;
  deviceIds?: string[];  // opzionale: se omesso revoca tutti
}

export interface RemoveMemberResult {
  success: boolean;
  revokedDevices: string[];
}

// ─── shareDevice ──────────────────────────────────────────────────────────────

/**
 * Condivide uno o più device con un utente identificato per email.
 * Chiama la Cloud Function `shareDevice` che usa Admin SDK.
 *
 * @example
 * await shareDeviceWithMember({
 *   memberEmail: 'mario@esempio.it',
 *   deviceIds: ['MF-A3F9', 'MF-B7C2'],
 * });
 */
export async function shareDeviceWithMember(
  params: ShareDeviceParams
): Promise<ShareDeviceResult> {
  const fn = httpsCallable<ShareDeviceParams, ShareDeviceResult>(
    functions,
    "shareDevice"
  );

  const result = await fn(params);
  return result.data;
}

// ─── removeMember ─────────────────────────────────────────────────────────────

/**
 * Revoca l'accesso di un member a uno o tutti i device condivisi.
 * Se `deviceIds` è omesso, revoca l'accesso a tutti i device.
 *
 * @example
 * // Revoca solo un device
 * await revokeMemberAccess({ memberUid: 'abc123', deviceIds: ['MF-A3F9'] });
 *
 * // Rimuove completamente il member
 * await revokeMemberAccess({ memberUid: 'abc123' });
 */
export async function revokeMemberAccess(
  params: RemoveMemberParams
): Promise<RemoveMemberResult> {
  const fn = httpsCallable<RemoveMemberParams, RemoveMemberResult>(
    functions,
    "removeMember"
  );

  const result = await fn(params);
  return result.data;
}
