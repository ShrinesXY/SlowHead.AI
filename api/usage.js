// api/usage.js
// Dipanggil pas halaman dibuka, buat nampilin "sisa X pesan hari ini"
// tanpa harus kirim pesan dulu.

import { adminAuth, db } from "./_lib/firebaseAdmin.js";

const DAILY_LIMIT = 5;

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const authHeader = req.headers.authorization || "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!idToken) return res.status(401).json({ error: "Belum login." });

  try {
    const decoded = await adminAuth.verifyIdToken(idToken);
    const usageRef = db.collection("usage").doc(`${decoded.uid}_${todayKey()}`);
    const snap = await usageRef.get();
    const count = snap.exists ? snap.data().count || 0 : 0;

    return res.status(200).json({
      remaining: Math.max(0, DAILY_LIMIT - count),
      limit: DAILY_LIMIT,
    });
  } catch (err) {
    console.error("usage.js error:", err);
    return res.status(401).json({ error: "Sesi login tidak valid." });
  }
}
