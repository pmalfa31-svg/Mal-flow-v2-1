"use strict";
/**
 * functions/src/index.ts
 * Firebase Functions v2 — compatibile con firebase-functions >= 5.x
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.removeMember = exports.shareDevice = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
admin.initializeApp();
const db = admin.firestore();
// ─── Helpers ──────────────────────────────────────────────────────────────────
async function assertOwnership(ownerUid, deviceIds) {
    const ownerSnap = await db.collection("users").doc(ownerUid).get();
    if (!ownerSnap.exists) {
        throw new https_1.HttpsError("not-found", "Profilo utente non trovato.");
    }
    const ownerData = ownerSnap.data();
    const ownedDevices = ownerData.devices ?? [];
    const notOwned = deviceIds.filter((id) => !ownedDevices.includes(id));
    if (notOwned.length > 0) {
        throw new https_1.HttpsError("permission-denied", `Non sei il proprietario dei seguenti device: ${notOwned.join(", ")}`);
    }
    return ownerData;
}
// ─── shareDevice ──────────────────────────────────────────────────────────────
exports.shareDevice = (0, https_1.onCall)({ region: "europe-west1" }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "Devi essere autenticato per condividere un device.");
    }
    const ownerUid = request.auth.uid;
    const { memberEmail, deviceIds } = request.data;
    if (!memberEmail || typeof memberEmail !== "string") {
        throw new https_1.HttpsError("invalid-argument", "memberEmail è obbligatorio.");
    }
    if (!Array.isArray(deviceIds) || deviceIds.length === 0) {
        throw new https_1.HttpsError("invalid-argument", "deviceIds deve essere un array non vuoto.");
    }
    if (memberEmail === request.auth.token.email) {
        throw new https_1.HttpsError("invalid-argument", "Non puoi condividere un device con te stesso.");
    }
    await assertOwnership(ownerUid, deviceIds);
    let memberRecord;
    try {
        memberRecord = await admin.auth().getUserByEmail(memberEmail);
    }
    catch {
        throw new https_1.HttpsError("not-found", `Nessun utente trovato con email: ${memberEmail}`);
    }
    const memberUid = memberRecord.uid;
    const memberProfileRef = db.collection("users").doc(memberUid);
    const memberProfileSnap = await memberProfileRef.get();
    if (!memberProfileSnap.exists) {
        throw new https_1.HttpsError("not-found", "Il member non ha ancora completato la registrazione.");
    }
    await db.runTransaction(async (tx) => {
        const memberDocRef = db
            .collection("users")
            .doc(ownerUid)
            .collection("members")
            .doc(memberUid);
        const memberSnap = await tx.get(memberDocRef);
        const existingDevices = memberSnap.exists
            ? (memberSnap.data().devices ?? [])
            : [];
        const mergedDevices = Array.from(new Set([...existingDevices, ...deviceIds]));
        tx.set(memberDocRef, {
            uid: memberUid,
            email: memberRecord.email ?? memberEmail,
            displayName: memberRecord.displayName ?? null,
            role: "viewer",
            devices: mergedDevices,
            addedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        tx.update(memberProfileRef, {
            devices: admin.firestore.FieldValue.arrayUnion(...deviceIds),
        });
    });
    return { success: true, memberUid, sharedDevices: deviceIds };
});
// ─── removeMember ─────────────────────────────────────────────────────────────
exports.removeMember = (0, https_1.onCall)({ region: "europe-west1" }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "Devi essere autenticato.");
    }
    const ownerUid = request.auth.uid;
    const { memberUid, deviceIds } = request.data;
    if (!memberUid || typeof memberUid !== "string") {
        throw new https_1.HttpsError("invalid-argument", "memberUid è obbligatorio.");
    }
    const memberDocRef = db
        .collection("users")
        .doc(ownerUid)
        .collection("members")
        .doc(memberUid);
    const memberSnap = await memberDocRef.get();
    if (!memberSnap.exists) {
        throw new https_1.HttpsError("not-found", "Member non trovato.");
    }
    const memberData = memberSnap.data();
    const devicesToRevoke = deviceIds ?? memberData.devices ?? [];
    if (devicesToRevoke.length > 0) {
        await assertOwnership(ownerUid, devicesToRevoke);
    }
    await db.runTransaction(async (tx) => {
        const memberProfileRef = db.collection("users").doc(memberUid);
        if (deviceIds && deviceIds.length > 0) {
            const remainingDevices = memberData.devices.filter((d) => !deviceIds.includes(d));
            if (remainingDevices.length === 0) {
                tx.delete(memberDocRef);
            }
            else {
                tx.update(memberDocRef, { devices: remainingDevices });
            }
            tx.update(memberProfileRef, {
                devices: admin.firestore.FieldValue.arrayRemove(...deviceIds),
            });
        }
        else {
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
//# sourceMappingURL=index.js.map