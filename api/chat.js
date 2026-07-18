// api/chat.js
// Proxy ke provider AI (Gemini langsung, atau OpenRouter buat model non-Gemini
// kayak GPT-4o). Wajib login (Firebase ID token), dibatasi 5 pesan/hari/user.
// API key provider tetap cuma ada di server, gak pernah dikirim ke browser.

import { adminAuth, db } from "./_lib/firebaseAdmin.js";

const SYSTEM_PROMPT =
  "Anggap Diri Mu Adalah SlowHead AI yang dikembangkan oleh BeeThere, " +
  "Ketika User Bertanya Pada Mu tolong jawab hanya inti nya saja tidak usah bertele tele";

// Whitelist model yang boleh dipilih user — jangan biarkan client kirim
// nama model bebas (bisa dipakai buat manggil model mahal tanpa kontrol).
// "provider" nentuin API mana yang dipanggil dan cara format request-nya.
const ALLOWED_MODELS = {
  "gemini-3.1-flash-lite": { label: "Cepat & Hemat", provider: "gemini" },
  "gemini-3.5-flash": { label: "Seimbang", provider: "gemini" },
  "gemini-3.1-pro": { label: "Paling Pintar", provider: "gemini" },
  "openai/gpt-4o": { label: "ChatGPT (GPT-4o)", provider: "openrouter" },
};
const DEFAULT_MODEL = "gemini-3.5-flash";
const DAILY_LIMIT = 5;

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

async function callGemini(model, messages, apiKey) {
  const contents = messages.map((m) => ({
    role: m.role === "assistant" || m.role === "model" ? "model" : "user",
    parts: [{ text: String(m.text || "").slice(0, 8000) }],
  }));

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents,
      systemInstruction: { role: "system", parts: [{ text: SYSTEM_PROMPT }] },
      generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || "Gagal menghubungi Gemini API.");

  return (
    data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") ||
    "Maaf, gak dapat jawaban dari model."
  );
}

async function callOpenRouter(model, messages, apiKey) {
  const chatMessages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...messages.map((m) => ({
      role: m.role === "assistant" || m.role === "model" ? "assistant" : "user",
      content: String(m.text || "").slice(0, 8000),
    })),
  ];

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: chatMessages,
      temperature: 0.7,
      max_tokens: 1024,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || "Gagal menghubungi OpenRouter API.");

  return data?.choices?.[0]?.message?.content || "Maaf, gak dapat jawaban dari model.";
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // ---- 1. Verifikasi login user ----
  const authHeader = req.headers.authorization || "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!idToken) return res.status(401).json({ error: "Belum login." });

  let uid;
  try {
    const decoded = await adminAuth.verifyIdToken(idToken);
    uid = decoded.uid;
  } catch {
    return res.status(401).json({ error: "Sesi login tidak valid, coba login ulang." });
  }

  // ---- 2. Tentuin model & provider ----
  const { messages, model } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "Field 'messages' wajib diisi (array)." });
  }
  const selectedModelId = ALLOWED_MODELS[model] ? model : DEFAULT_MODEL;
  const selected = ALLOWED_MODELS[selectedModelId];

  const geminiKey = process.env.GEMINI_API_KEY;
  const openrouterKey = process.env.OPENROUTER_API_KEY;

  if (selected.provider === "gemini" && !geminiKey) {
    return res.status(500).json({ error: "GEMINI_API_KEY belum diset di server." });
  }
  if (selected.provider === "openrouter" && !openrouterKey) {
    return res.status(500).json({ error: "OPENROUTER_API_KEY belum diset di server." });
  }

  // ---- 3. Cek limit harian ----
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

    // ---- 4. Panggil provider yang sesuai ----
    const reply =
      selected.provider === "gemini"
        ? await callGemini(selectedModelId, messages, geminiKey)
        : await callOpenRouter(selectedModelId, messages, openrouterKey);

    // ---- 5. Increment counter (baru dihitung kalau sukses) ----
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
    return res.status(500).json({ error: err.message || "Terjadi kesalahan di server." });
  }
}
