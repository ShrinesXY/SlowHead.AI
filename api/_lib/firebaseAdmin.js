// api/_lib/firebaseAdmin.js
// Inisialisasi Firebase Admin SDK (server-side). Dipakai buat:
// - verify ID token dari user yang login (Firebase Auth)
// - baca/tulis Firestore (data user & counter limit harian)

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function initFirebaseAdmin() {
  if (getApps().length > 0) return getApps()[0];

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT_JSON belum diset di environment variable server."
    );
  }

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(raw);
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON isinya bukan JSON yang valid.");
  }

  return initializeApp({
    credential: cert(serviceAccount),
  });
}

const app = initFirebaseAdmin();
export const adminAuth = getAuth(app);
export const db = getFirestore(app);
