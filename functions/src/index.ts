/**
 * functions/src/index.ts
 * Firebase Functions v2 — compatibile con firebase-functions >= 5.x
 */

import { onCall, CallableRequest, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

admin.initializeApp();
const db = admin.firestore();

// ─── Tipi ─────────────────────────────────────────────────────────────────────

interface ShareDeviceData {
  memberEmail: string;
  deviceIds: string[];
}

interface RemoveMemberData {
  memberUid: string;
  deviceIds?: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function assertOwnership(
  ownerUid: string,
  deviceIds: string[]
): Promise<FirebaseFirestore.DocumentData> {
  const ownerSnap = await db.collection("users").doc(ownerUid).get();
  if (!ownerSnap.exists) {
    throw new HttpsError("not-found", "Profilo utente non trovato.");
  }
  const ownerData = ownerSnap.data()!;
  const ownedDevices: string[] = ownerData.devices ?? [];
  const notOwned = deviceIds.filter((id) => !ownedDevices.includes(id));
  if (notOwned.length > 0) {
    throw new HttpsError(
      "permission-denied",
      `Non sei il proprietario dei seguenti device: ${notOwned.join(", ")}`
    );
  }
  return ownerData;
}

// ─── shareDevice ──────────────────────────────────────────────────────────────

export const shareDevice = onCall(
  { region: "europe-west1" },
  async (request: CallableRequest<ShareDeviceData>) => {

    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Devi essere autenticato per condividere un device.");
    }

    const ownerUid = request.auth.uid;
    const { memberEmail, deviceIds } = request.data;

    if (!memberEmail || typeof memberEmail !== "string") {
      throw new HttpsError("invalid-argument", "memberEmail è obbligatorio.");
    }
    if (!Array.isArray(deviceIds) || deviceIds.length === 0) {
      throw new HttpsError("invalid-argument", "deviceIds deve essere un array non vuoto.");
    }
    if (memberEmail === request.auth.token.email) {
      throw new HttpsError("invalid-argument", "Non puoi condividere un device con te stesso.");
    }

    await assertOwnership(ownerUid, deviceIds);

    let memberRecord: admin.auth.UserRecord;
    try {
      memberRecord = await admin.auth().getUserByEmail(memberEmail);
    } catch {
      throw new HttpsError("not-found", `Nessun utente trovato con email: ${memberEmail}`);
    }
    const memberUid = memberRecord.uid;

    const memberProfileRef = db.collection("users").doc(memberUid);
    const memberProfileSnap = await memberProfileRef.get();
    if (!memberProfileSnap.exists) {
      throw new HttpsError("not-found", "Il member non ha ancora completato la registrazione.");
    }

    await db.runTransaction(async (tx) => {
      const memberDocRef = db
        .collection("users")
        .doc(ownerUid)
        .collection("members")
        .doc(memberUid);

      const memberSnap = await tx.get(memberDocRef);
      const existingDevices: string[] = memberSnap.exists
        ? (memberSnap.data()!.devices ?? [])
        : [];
      const mergedDevices = Array.from(new Set([...existingDevices, ...deviceIds]));

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

      tx.update(memberProfileRef, {
        devices: admin.firestore.FieldValue.arrayUnion(...deviceIds),
      });
    });

    return { success: true, memberUid, sharedDevices: deviceIds };
  }
);

// ─── removeMember ─────────────────────────────────────────────────────────────

export const removeMember = onCall(
  { region: "europe-west1" },
  async (request: CallableRequest<RemoveMemberData>) => {

    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Devi essere autenticato.");
    }

    const ownerUid = request.auth.uid;
    const { memberUid, deviceIds } = request.data;

    if (!memberUid || typeof memberUid !== "string") {
      throw new HttpsError("invalid-argument", "memberUid è obbligatorio.");
    }

    const memberDocRef = db
      .collection("users")
      .doc(ownerUid)
      .collection("members")
      .doc(memberUid);

    const memberSnap = await memberDocRef.get();
    if (!memberSnap.exists) {
      throw new HttpsError("not-found", "Member non trovato.");
    }

    const memberData = memberSnap.data()!;
    const devicesToRevoke: string[] = deviceIds ?? memberData.devices ?? [];

    if (devicesToRevoke.length > 0) {
      await assertOwnership(ownerUid, devicesToRevoke);
    }

    await db.runTransaction(async (tx) => {
      const memberProfileRef = db.collection("users").doc(memberUid);

      if (deviceIds && deviceIds.length > 0) {
        const remainingDevices = (memberData.devices as string[]).filter(
          (d) => !deviceIds.includes(d)
        );
        if (remainingDevices.length === 0) {
          tx.delete(memberDocRef);
        } else {
          tx.update(memberDocRef, { devices: remainingDevices });
        }
        tx.update(memberProfileRef, {
          devices: admin.firestore.FieldValue.arrayRemove(...deviceIds),
        });
      } else {
        tx.delete(memberDocRef);
        if (devicesToRevoke.length > 0) {
          tx.update(memberProfileRef, {
            devices: admin.firestore.FieldValue.arrayRemove(...devicesToRevoke),
          });
        }
      }
    });

    return { success: true, revokedDevices: devicesToRevoke };
  }
);
