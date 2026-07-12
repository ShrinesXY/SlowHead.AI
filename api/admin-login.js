// api/admin-login.js
// Login admin tunggal (bukan Firebase Auth). Username & hash password
// disimpan di environment variable, gak pernah di kode.

import { verifyPassword } from "./_lib/password.js";
import { createSessionToken, setSessionCookie } from "./_lib/session.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const adminUser = process.env.ADMIN_USERNAME;
  const adminHash = process.env.ADMIN_PASSWORD_HASH;
  if (!adminUser || !adminHash) {
    return res.status(500).json({ error: "Admin belum dikonfigurasi di server." });
  }

  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: "Username & password wajib diisi." });
  }

  if (username !== adminUser || !verifyPassword(password, adminHash)) {
    return res.status(401).json({ error: "Username atau password salah." });
  }

  const token = createSessionToken({ role: "admin", u: username });
  setSessionCookie(res, token);

  return res.status(200).json({ ok: true });
}
