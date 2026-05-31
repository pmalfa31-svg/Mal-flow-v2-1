/**
 * functions/src/index.ts
 *
 * Cloud Functions per Mal-flow v2.1
 *
 * FIX #2 — shareDevice / removeDevice
 * Le security rules impediscono a un client di scrivere nel profilo
 * di un altro utente (giustamente). Queste Callable Functions usano
 * Admin SDK (bypass delle rules) per implementare in modo sicuro
 * il flusso di condivisione device con un member.
 *
 * Flusso shareDevice:
 *   Owner → chiama shareDevice({ memberEmail, deviceIds })
 *   Function:
 *     1. Verifica che l'owner esista e possieda tutti i deviceIds
 *     2. Trova il member per email in Firebase Auth
 *     3. Crea/aggiorna /users/{ownerUid}/members/{memberUid}
 *     4. Aggiunge i deviceIds all'array /users/{memberUid}.devices
 *
 * Flusso removeDevice (revoca accesso member):
 *   Owner → chiama removeMember({ memberUid, deviceIds? })
 *   Function:
 *     1. Verifica ownership
 *     2. Cancella /users/{ownerUid}/members/{memberUid}
 *     3. Rimuove i deviceIds da /users/{memberUid}.devices
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

admin.initializeApp();
const db = admin.firestore();

// ─── Tipi ────────────────────────────────────────────────────────────────────

interface ShareDeviceData {
  memberEmail: string;
  deviceIds: string[];
}

interface RemoveMemberData {
  memberUid: string;
  deviceIds?: string[];   // se omesso rimuove l'accesso a tutti i device condivisi
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Verifica che l'utente autenticato esista e possieda tutti i deviceIds
 * nel proprio profilo Firestore.
 */
async function assertOwnership(
  ownerUid: string,
  deviceIds: string[]
): Promise<FirebaseFirestore.DocumentData> {
  const ownerSnap = await db.collection("users").doc(ownerUid).get();
  if (!ownerSnap.exists) {
    throw new functions.https.HttpsError(
      "not-found",
      "Profilo utente non trovato."
    );
  }
  const ownerData = ownerSnap.data()!;
  const ownedDevices: string[] = ownerData.devices ?? [];

  const notOwned = deviceIds.filter((id) => !ownedDevices.includes(id));
  if (notOwned.length > 0) {
    throw new functions.https.HttpsError(
      "permission-denied",
      `Non sei il proprietario dei seguenti device: ${notOwned.join(", ")}`
    );
  }
  return ownerData;
}

// ─── shareDevice ─────────────────────────────────────────────────────────────

export const shareDevice = functions
  .region("europe-west1")
  .https.onCall(async (data: ShareDeviceData, context) => {

    // Auth check
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Devi essere autenticato per condividere un device."
      );
    }

    const ownerUid = context.auth.uid;
    const { memberEmail, deviceIds } = data;

    // Validazione input
    if (!memberEmail || typeof memberEmail !== "string") {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "memberEmail è obbligatorio."
      );
    }
    if (!Array.isArray(deviceIds) || deviceIds.length === 0) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "deviceIds deve essere un array non vuoto."
      );
    }

    // Impedisce di condividere con se stessi
    if (memberEmail === context.auth.token.email) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Non puoi condividere un device con te stesso."
      );
    }

    // Verifica ownership
    await assertOwnership(ownerUid, deviceIds);

    // Trova il member per email in Firebase Auth
    let memberRecord: admin.auth.UserRecord;
    try {
      memberRecord = await admin.auth().getUserByEmail(memberEmail);
    } catch {
      throw new functions.https.HttpsError(
        "not-found",
        `Nessun utente trovato con email: ${memberEmail}`
      );
    }
    const memberUid = memberRecord.uid;

    // Verifica che il profilo Firestore del member esista
    const memberProfileRef = db.collection("users").doc(memberUid);
    const memberProfileSnap = await memberProfileRef.get();
    if (!memberProfileSnap.exists) {
      throw new functions.https.HttpsError(
        "not-found",
        "Il member non ha ancora completato la registrazione."
      );
    }

    // Transazione atomica: aggiorna sia /users/{ownerUid}/members/{memberUid}
    // sia /users/{memberUid}.devices
    await db.runTransaction(async (tx) => {
      const memberDocRef = db
        .collection("users")
        .doc(ownerUid)
        .collection("members")
        .doc(memberUid);

      // Legge il documento member esistente (se c'è) per fare merge dei device
      const memberSnap = await tx.get(memberDocRef);
      const existingDevices: string[] = memberSnap.exists
        ? (memberSnap.data()!.devices ?? [])
        : [];
      const mergedDevices = Array.from(new Set([...existingDevices, ...deviceIds]));

      // 1) Crea/aggiorna /users/{ownerUid}/members/{memberUid}
      tx.set(
        memberDocRef,
        {
          uid: memberUid,
          email: memberRecord.email ?? memberEmail,
          displayName: memberRecord.displayName ?? null,
          role: "viewer",
          devices: mergedDevices,
          addedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      // 2) Aggiunge i deviceIds all'array /users/{memberUid}.devices
      tx.update(memberProfileRef, {
        devices: admin.firestore.FieldValue.arrayUnion(...deviceIds),
      });
    });

    return {
      success: true,
      memberUid,
      sharedDevices: deviceIds,
    };
  });

// ─── removeMember ─────────────────────────────────────────────────────────────

export const removeMember = functions
  .region("europe-west1")
  .https.onCall(async (data: RemoveMemberData, context) => {

    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Devi essere autenticato."
      );
    }

    const ownerUid = context.auth.uid;
    const { memberUid, deviceIds } = data;

    if (!memberUid || typeof memberUid !== "string") {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "memberUid è obbligatorio."
      );
    }

    // Legge il documento member per sapere quali device revocare
    const memberDocRef = db
      .collection("users")
      .doc(ownerUid)
      .collection("members")
      .doc(memberUid);

    const memberSnap = await memberDocRef.get();
    if (!memberSnap.exists) {
      throw new functions.https.HttpsError(
        "not-found",
        "Member non trovato."
      );
    }

    const memberData = memberSnap.data()!;
    // Se deviceIds non specificato, revoca tutti i device condivisi con questo member
    const devicesToRevoke: string[] = deviceIds ?? memberData.devices ?? [];

    // Verifica che l'owner possegga i device che vuole revocare
    if (devicesToRevoke.length > 0) {
      await assertOwnership(ownerUid, devicesToRevoke);
    }

    await db.runTransaction(async (tx) => {
      const memberProfileRef = db.collection("users").doc(memberUid);

      if (deviceIds && deviceIds.length > 0) {
        // Revoca parziale: rimuove solo i deviceIds specificati
        const remainingDevices = (memberData.devices as string[]).filter(
          (d) => !deviceIds.includes(d)
        );

        if (remainingDevices.length === 0) {
          // Nessun device rimasto: rimuove l'intera entry member
          tx.delete(memberDocRef);
        } else {
          tx.update(memberDocRef, { devices: remainingDevices });
        }

        tx.update(memberProfileRef, {
          devices: admin.firestore.FieldValue.arrayRemove(...deviceIds),
        });
      } else {
        // Revoca totale: elimina il member e rimuove tutti i device condivisi
        tx.delete(memberDocRef);
        if (devicesToRevoke.length > 0) {
          tx.update(memberProfileRef, {
            devices: admin.firestore.FieldValue.arrayRemove(...devicesToRevoke),
          });
        }
      }
    });

    return { success: true, revokedDevices: devicesToRevoke };
  });
