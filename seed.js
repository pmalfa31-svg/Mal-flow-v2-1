/**
 * seed.js — Development data seeder for Mal Flow
 * Uses the NEW user-centric schema:
 *   - Device documents have NO ownerId / sharedWith
 *   - Ownership lives in /users/{uid}.devices[]
 *   - Family members live in /users/{ownerUid}/members/{memberUid}
 *
 * Run: node seed.js
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const serviceAccount = JSON.parse(readFileSync('./serviceAccountKey.json', 'utf-8'));

const app = initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore(app, "ai-studio-84d086fd-39aa-4a5a-8e4a-3cbfe54d98fd");

// ─── Config ───────────────────────────────────────────────────────────────────

const OWNER_UID    = "bo18URoNRtSj2f00BnfrOS4CdTF2";
const OWNER_EMAIL  = "pmalfa31@gmail.com";
const DEVICE_ID    = "MF-A3F9"; // Format used in production: MF-XXXX

// Optional: a second user to test family sharing
const MEMBER_UID   = ""; // leave empty to skip member seeding
const MEMBER_EMAIL = "";

// ─── Seed ─────────────────────────────────────────────────────────────────────

async function seedDatabase() {
  console.log("🌱 Starting Mal Flow seed (user-centric schema)...\n");

  try {
    // 1. Create / update owner user doc
    console.log("👤 Creating owner user doc...");
    await db.collection("users").doc(OWNER_UID).set({
      uid: OWNER_UID,
      email: OWNER_EMAIL,
      displayName: "Paolo Malfatto",
      createdAt: Timestamp.now(),
      devices: [DEVICE_ID]   // ← ownership lives here
    }, { merge: true });
    console.log(`   ✅ /users/${OWNER_UID}  →  devices: [${DEVICE_ID}]\n`);

    // 2. Create device doc — anonymous, no ownerId
    console.log("📡 Creating device doc (anonymous)...");
    await db.collection("devices").doc(DEVICE_ID).set({
      id: DEVICE_ID,
      name: "Valvola Ingresso",
      batteryVoltage: 3.9,
      currentFlow: 0,
      temperature: 22,
      pressure: 2.5,
      humidity: 45,
      lastUpdate: Timestamp.now(),
      claimedAt: Timestamp.now(),
      settings: {
        notificationsEnabled: true,
        emailAlerts: true,
        dailyThreshold: 1000,
        leakThreshold: 1.0,
        nightStart: "00:00",
        nightEnd: "06:00"
      }
    });
    console.log(`   ✅ /devices/${DEVICE_ID}  (no ownerId, no sharedWith)\n`);

    // 3. Generate 24 hours of history
    console.log("📊 Generating 24h of history...");
    const historyRef = db.collection("devices").doc(DEVICE_ID).collection("history");
    const now = new Date();

    for (let i = 0; i < 24; i++) {
      const batchTime = new Date(now.getTime() - i * 3600000);
      const readings = Array.from({ length: 12 }, () =>
        Number((Math.random() * 2).toFixed(2))
      );
      const averageFlow = readings.reduce((a, b) => a + b, 0) / 12;

      await historyRef.add({
        timestamp: Timestamp.fromDate(batchTime),
        readings,
        averageFlow,
        batteryVoltage: 3.8 + Math.random() * 0.1,
        temperature: 20 + Math.random()
      });
    }
    console.log("   ✅ 24 hourly batches written\n");

    // 4. Optional: seed a family member
    if (MEMBER_UID && MEMBER_EMAIL) {
      console.log("👨‍👩‍👧 Seeding family member...");

      // Member user doc
      await db.collection("users").doc(MEMBER_UID).set({
        uid: MEMBER_UID,
        email: MEMBER_EMAIL,
        displayName: "Membro Famiglia",
        createdAt: Timestamp.now(),
        devices: [DEVICE_ID]   // member also has the device in their array
      }, { merge: true });

      // Member subdoc under owner
      await db.collection("users").doc(OWNER_UID)
        .collection("members").doc(MEMBER_UID).set({
          uid: MEMBER_UID,
          email: MEMBER_EMAIL,
          displayName: "Membro Famiglia",
          role: "viewer",
          devices: [DEVICE_ID],
          addedAt: Timestamp.now()
        });

      console.log(`   ✅ /users/${OWNER_UID}/members/${MEMBER_UID}\n`);
    }

    console.log("🎉 Seeding complete! Check Firebase console.");

  } catch (error) {
    console.error("❌ Error during seeding:", error);
  }
}

seedDatabase();
