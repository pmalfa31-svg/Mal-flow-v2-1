/**
 * src/services/deviceService.ts
 *
 * FIX #1 — claimedAt viene scritto SOLO durante il primo pairing
 *           e solo se non è già settato. Il campo non è mai incluso
 *           negli update successivi (es. rinomina, settings).
 *           Le rules lo bloccano comunque server-side, ma è buona pratica
 *           non inviarlo dal client dopo il primo pairing.
 *
 * FIX #4 — markAlertAsRead invia solo { isRead: true }.
 *           Le rules rifiutano qualunque altro valore o campo.
 */

import {
  getFirestore,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  arrayUnion,
  collection,
  query,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { getAuth } from "firebase/auth";

const db = getFirestore();
const auth = getAuth();

// ─── Tipi ─────────────────────────────────────────────────────────────────────

export interface DeviceSettings {
  notificationsEnabled: boolean;
  emailAlerts: boolean;
  dailyThreshold: number;
  leakThreshold: number;
  nightStart: string;
  nightEnd: string;
}

export interface Device {
  id: string;
  name: string;
  batteryVoltage: number;
  currentFlow: number;
  temperature: number;
  pressure: number;
  humidity: number;
  lastUpdate: Timestamp | null;
  claimedAt: Timestamp | null;
  settings: Partial<DeviceSettings>;
}

export interface Alert {
  id: string;
  type: "leak" | "usage" | "battery";
  severity: "info" | "warning" | "critical";
  message: string;
  timestamp: Timestamp;
  isRead: boolean;
}

export interface HourlyRecord {
  id: string;
  timestamp: Timestamp;
  readings: number[];
  averageFlow: number;
  batteryVoltage: number;
  temperature: number;
}

// ─── getUserDevices ────────────────────────────────────────────────────────────

/**
 * Legge il profilo utente, estrae l'array devices,
 * poi carica ogni device per ID specifico.
 */
export async function getUserDevices(): Promise<Device[]> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Utente non autenticato.");

  const userSnap = await getDoc(doc(db, "users", uid));
  if (!userSnap.exists()) throw new Error("Profilo utente non trovato.");

  const deviceIds: string[] = userSnap.data().devices ?? [];
  if (deviceIds.length === 0) return [];

  const devices = await Promise.all(
    deviceIds.map(async (deviceId) => {
      const snap = await getDoc(doc(db, "devices", deviceId));
      if (!snap.exists()) return null;
      return { id: snap.id, ...snap.data() } as Device;
    })
  );

  return devices.filter(Boolean) as Device[];
}

// ─── getDevice ────────────────────────────────────────────────────────────────

export async function getDevice(deviceId: string): Promise<Device | null> {
  const snap = await getDoc(doc(db, "devices", deviceId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Device;
}

// ─── pairDevice ───────────────────────────────────────────────────────────────

/**
 * FIX #1 — claimedAt viene incluso SOLO qui (primo pairing).
 * Se il device è già claimed (claimedAt != null), le rules lo bloccano
 * server-side. Inviamo comunque claimedAt dal client per il caso
 * in cui il device sia nuovo (claimedAt === null).
 *
 * Flusso:
 *   1. Verifica che il device esista
 *   2. Aggiunge il deviceId all'array dell'utente
 *   3. Imposta claimedAt (le rules lo accettano solo se era null)
 */
export async function pairDevice(deviceId: string): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Utente non autenticato.");

  // 1. Verifica che il device esista
  const deviceSnap = await getDoc(doc(db, "devices", deviceId));
  if (!deviceSnap.exists()) {
    throw new Error(`Device ${deviceId} non trovato. Controlla il codice.`);
  }

  const deviceData = deviceSnap.data() as Device;

  // 2. Aggiunge il deviceId all'array dell'utente
  await updateDoc(doc(db, "users", uid), {
    devices: arrayUnion(deviceId),
  });

  // 3. FIX #1 — claimedAt solo se non era già settato
  //    Le rules bloccano questa scrittura se deviceAlreadyClaimed() = true,
  //    quindi è safe inviarlo sempre: nel caso worst case la rule lo rifiuta
  //    e il device rimane paired (solo l'arrayUnion conta per l'utente).
  if (!deviceData.claimedAt) {
    await updateDoc(doc(db, "devices", deviceId), {
      claimedAt: serverTimestamp(),
    });
  }
}

// ─── unpairDevice ─────────────────────────────────────────────────────────────

import { arrayRemove } from "firebase/firestore";

export async function unpairDevice(deviceId: string): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Utente non autenticato.");

  await updateDoc(doc(db, "users", uid), {
    devices: arrayRemove(deviceId),
  });
}

// ─── updateDeviceName ─────────────────────────────────────────────────────────

/**
 * FIX #1 — NON include claimedAt nell'update.
 * Solo name è modificato qui.
 */
export async function updateDeviceName(
  deviceId: string,
  name: string
): Promise<void> {
  await updateDoc(doc(db, "devices", deviceId), { name });
}

// ─── updateDeviceSettings ─────────────────────────────────────────────────────

/**
 * FIX #1 — NON include claimedAt nell'update.
 * Solo settings è modificato qui.
 */
export async function updateDeviceSettings(
  deviceId: string,
  settings: Partial<DeviceSettings>
): Promise<void> {
  await updateDoc(doc(db, "devices", deviceId), { settings });
}

// ─── markAlertAsRead ─────────────────────────────────────────────────────────

/**
 * FIX #4 — Invia SOLO { isRead: true }.
 * Le rules rifiutano: isRead = false, qualunque altro campo,
 * e qualunque utente che non ha il device nel proprio profilo.
 */
export async function markAlertAsRead(
  deviceId: string,
  alertId: string
): Promise<void> {
  const alertRef = doc(db, "devices", deviceId, "alerts", alertId);
  await updateDoc(alertRef, { isRead: true });
}

// ─── getAlerts ────────────────────────────────────────────────────────────────

export async function getAlerts(
  deviceId: string,
  onlyUnread = false
): Promise<Alert[]> {
  const alertsRef = collection(db, "devices", deviceId, "alerts");
  const snap = await getDocs(
    query(alertsRef, orderBy("timestamp", "desc"), limit(50))
  );

  const alerts = snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  })) as Alert[];

  return onlyUnread ? alerts.filter((a) => !a.isRead) : alerts;
}

// ─── getHistory ───────────────────────────────────────────────────────────────

export async function getHistory(
  deviceId: string,
  limitCount = 24
): Promise<HourlyRecord[]> {
  const histRef = collection(db, "devices", deviceId, "history");
  const snap = await getDocs(
    query(histRef, orderBy("timestamp", "desc"), limit(limitCount))
  );

  return snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  })) as HourlyRecord[];
}
