/**
 * proactiveMonitor.ts
 * Runs server-side (Node/Express) via Admin SDK.
 * Listens to new history batches across ALL devices and generates alerts.
 *
 * No changes needed to the core logic — the monitor never reads ownerId/sharedWith.
 * It only writes to /devices/{deviceId}/alerts, which the frontend reads
 * based on the user's devices[] array.
 */

import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

if (admin.apps.length === 0) {
  admin.initializeApp({
    projectId: firebaseConfig.projectId,
  });
}

const db = getFirestore(firebaseConfig.firestoreDatabaseId || '(default)');

export function startMonitoring() {
  console.log("🔍 Proactive monitoring started (user-centric schema)...");

  const historyQuery = db.collectionGroup('history');

  historyQuery.onSnapshot((snapshot) => {
    snapshot.docChanges().forEach(async (change) => {
      if (change.type === 'added') {
        const hData = change.doc.data();
        const deviceRef = change.doc.ref.parent.parent;

        if (deviceRef) {
          const deviceSnap = await deviceRef.get();
          if (deviceSnap.exists) {
            const deviceData = deviceSnap.data() as any;
            checkAlerts(deviceData, hData, deviceRef);
          }
        }
      }
    });
  }, (err) => {
    console.error("Monitoring Error:", err);
  });
}

async function checkAlerts(
  device: any,
  history: any,
  deviceRef: admin.firestore.DocumentReference
) {
  const settings = device.settings || {
    notificationsEnabled: true,
    dailyThreshold: 1000,
    leakThreshold: 1.0,
    nightStart: "00:00",
    nightEnd: "06:00"
  };

  if (!settings.notificationsEnabled) return;

  const { readings, averageFlow, timestamp } = history;
  const alertCollection = deviceRef.collection('alerts');

  // 1. Nighttime Leak Detection
  const recordTime = timestamp.toDate();
  const readableTime =
    recordTime.getHours() + ":" + String(recordTime.getMinutes()).padStart(2, '0');

  const isNight = isTimeBetween(readableTime, settings.nightStart, settings.nightEnd);

  if (isNight) {
    const hasLeak = readings.some((val: number) => val > settings.leakThreshold);
    if (hasLeak) {
      await createAlert(alertCollection, {
        type: 'leak',
        severity: 'critical',
        message: `Possible leak detected at ${readableTime}. Abnormal flow during night hours: ${averageFlow.toFixed(2)} L/min.`,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        isRead: false
      });
    }
  }

  // 2. High Consumption Spike
  if (averageFlow > (settings.dailyThreshold / 1440) * 5) {
    await createAlert(alertCollection, {
      type: 'usage',
      severity: 'warning',
      message: `High consumption detected at ${readableTime}: ${averageFlow.toFixed(2)} L/min.`,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      isRead: false
    });
  }

  // 3. Low Battery
  if (device.batteryVoltage && device.batteryVoltage < 3.4) {
    await createAlert(alertCollection, {
      type: 'battery',
      severity: 'warning',
      message: `Low battery: ${device.batteryVoltage.toFixed(2)}V. Consider charging soon.`,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      isRead: false
    });
  }
}

function isTimeBetween(time: string, start: string, end: string) {
  const [h, m] = time.split(':').map(Number);
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);

  const now = h * 60 + m;
  const s = sh * 60 + sm;
  const e = eh * 60 + em;

  return s <= e ? now >= s && now <= e : now >= s || now <= e;
}

async function createAlert(
  collection: admin.firestore.CollectionReference,
  alert: any
) {
  // Deduplicate: skip if same type alert already exists in last 60 min
  const recentLimit = new Date();
  recentLimit.setMinutes(recentLimit.getMinutes() - 60);

  const existing = await collection
    .where('type', '==', alert.type)
    .where('timestamp', '>', recentLimit)
    .limit(1)
    .get();

  if (existing.empty) {
    console.log(`🚨 Alert generated: [${alert.type}] ${alert.message}`);
    await collection.add(alert);

    if (alert.severity === 'critical') {
      sendEmailSim(alert);
    }
  }
}

function sendEmailSim(alert: any) {
  console.log(
    `📧 [EMAIL] Subject: ${alert.severity.toUpperCase()} — ${alert.type} | ${alert.message}`
  );
}
