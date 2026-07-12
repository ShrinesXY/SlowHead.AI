// api/chat.js
// Proxy ke Gemini API. Sekarang wajib login (Firebase ID token) dan
// dibatasi 5 pesan per hari per user. API key Gemini tetap cuma ada
// di server, gak pernah dikirim ke browser.

import { adminAuth, db } from "./_lib/firebaseAdmin.js";

const SYSTEM_PROMPT =
  "Anggap Diri Mu Adalah SlowHead AI yang dikembangkan oleh BeeThere, " +
  "Ketika User Bertanya Pada Mu tolong jawab hanya inti nya saja tidak usah bertele tele";

const GEMINI_MODEL = "gemini-2.5-flash";
const DAILY_LIMIT = 5;

function todayKey() {
  // pakai UTC biar konsisten di server, format YYYY-MM-DD
  return new Date().toISOString().slice(0, 10);
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "GEMINI_API_KEY belum diset di server." });
  }

  // ---- 1. Verifikasi login user ----
  const authHeader = req.headers.authorization || "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!idToken) {
    return res.status(401).json({ error: "Belum login." });
  }

  let uid;
  try {
    const decoded = await adminAuth.verifyIdToken(idToken);
    uid = decoded.uid;
  } catch {
    return res.status(401).json({ error: "Sesi login tidak valid, coba login ulang." });
  }

  // ---- 2. Cek & update limit harian ----
  const usageRef = db.collection("usage").doc(`${uid}_${todayKey()}`);

  try {
    const usageSnap = await usageRef.get();
    const currentCount = usageSnap.exists ? usageSnap.data().count || 0 : 0;

    if (currentCount >= DAILY_LIMIT) {
      return res.status(429).json({
        error: `Limit harian ${DAILY_LIMIT} pesan udah abis. Coba lagi besok ya.`,
        remaining: 0,
        limit: DAILY_LIMIT,
      });
    }

    // ---- 3. Panggil Gemini ----
    const { messages } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "Field 'messages' wajib diisi (array)." });
    }

    const contents = messages.map((m) => ({
      role: m.role === "assistant" || m.role === "model" ? "model" : "user",
      parts: [{ text: String(m.text || "").slice(0, 8000) }],
    }));

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
    const geminiRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents,
        systemInstruction: { role: "system", parts: [{ text: SYSTEM_PROMPT }] },
        generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
      }),
    });

    const data = await geminiRes.json();

    if (!geminiRes.ok) {
      const msg = data?.error?.message || "Gagal menghubungi Gemini API.";
      return res.status(geminiRes.status).json({ error: msg });
    }

    const reply =
      data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") ||
      "Maaf, gak dapat jawaban dari model.";

    // ---- 4. Increment counter (baru dihitung kalau sukses) ----
    await usageRef.set(
      { count: currentCount + 1, uid, date: todayKey(), updatedAt: Date.now() },
      { merge: true }
    );

    return res.status(200).json({
      reply,
      remaining: DAILY_LIMIT - (currentCount + 1),
      limit: DAILY_LIMIT,
    });
  } catch (err) {
    console.error("chat.js error:", err);
    return res.status(500).json({ error: "Terjadi kesalahan di server." });
  }
}
