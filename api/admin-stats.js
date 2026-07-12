// api/admin-stats.js
// Dashboard data buat admin: daftar user & pemakaian hari ini.
// Dilindungi cookie session admin (bukan buat user biasa).

import { getSessionTokenFromReq, verifySessionToken } from "./_lib/session.js";
import { adminAuth, db } from "./_lib/firebaseAdmin.js";

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const token = getSessionTokenFromReq(req);
  const session = verifySessionToken(token);
  if (!session || session.role !== "admin") {
    return res.status(401).json({ error: "Belum login sebagai admin." });
  }

  try {
    const today = todayKey();

    // Ambil semua doc usage hari ini
    const usageSnap = await db
      .collection("usage")
      .where("date", "==", today)
      .get();

    const usageByUid = {};
    let totalMessagesToday = 0;
    usageSnap.forEach((doc) => {
      const d = doc.data();
      usageByUid[d.uid] = d.count || 0;
      totalMessagesToday += d.count || 0;
    });

    // Ambil daftar user dari Firebase Auth (maks 1000 per page, cukup buat skala kecil)
    const listResult = await adminAuth.listUsers(1000);
    const users = listResult.users.map((u) => ({
      uid: u.uid,
      email: u.email,
      createdAt: u.metadata.creationTime,
      lastSignIn: u.metadata.lastSignInTime,
      usedToday: usageByUid[u.uid] || 0,
    }));

    return res.status(200).json({
      totalUsers: users.length,
      totalMessagesToday,
      date: today,
      users: users.sort((a, b) => b.usedToday - a.usedToday),
    });
  } catch (err) {
    console.error("admin-stats.js error:", err);
    return res.status(500).json({ error: "Gagal ambil data." });
  }
}
