// scripts/hash-password.js
// Jalankan: node scripts/hash-password.js "password_baru"
// Output-nya paste ke env var ADMIN_PASSWORD_HASH di Vercel.

import crypto from "crypto";

const password = process.argv[2];
if (!password) {
  console.error("Pakai: node scripts/hash-password.js \"password_baru\"");
  process.exit(1);
}

const salt = crypto.randomBytes(16).toString("hex");
const hash = crypto.scryptSync(password, salt, 64).toString("hex");
console.log(`${salt}:${hash}`);
