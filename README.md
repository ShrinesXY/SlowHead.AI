# SlowHead AI

Chat AI oleh **BeeThere**, ditenagai Gemini API. Ada login user (email/password),
limit 5 pesan/hari per akun, dan panel admin buat pantau pemakaian.

## Struktur

```
slowhead-ai/
├── api/
│   ├── _lib/
│   │   ├── firebaseAdmin.js   # init Firebase Admin SDK
│   │   ├── password.js        # hash/verify password admin
│   │   └── session.js         # signed cookie buat login admin
│   ├── chat.js                # proxy ke Gemini, cek login + limit harian
│   ├── usage.js                # cek sisa kuota user
│   ├── admin-login.js
│   ├── admin-logout.js
│   └── admin-stats.js          # data dashboard admin
├── public/
│   ├── index.html               # UI chat + login/daftar
│   └── admin.html               # dashboard admin
├── scripts/
│   └── hash-password.js         # generate hash password baru
├── firestore.rules
├── .env.example
└── package.json
```

## ⚠️ Wajib dibaca soal keamanan

1. **API key Gemini yang lo kirim sebelumnya udah bocor** (pernah ditulis di chat). Revoke di [Google AI Studio](https://aistudio.google.com/app/apikey), generate baru, pasang yang baru sebagai env var — jangan yang lama.
2. **Password admin "disini" itu lemah.** Gw tetap pasangin sesuai request, tapi udah di-hash (bukan disimpan polos). Kalau repo ini nanti public di GitHub, siapapun cuma tau usernamenya `BeeThere` doang — hash-nya gak bisa dibalikin ke password asli. Tapi tetap, "disini" gampang ditebak kalau ada yang coba brute-force. **Saran: ganti begitu sempat**, caranya ada di bagian bawah.

## Setup — 3 bagian

### 1. Gemini
Sudah ada API key lo, tinggal generate baru (baca poin ⚠️ di atas), lalu simpan buat langkah deploy nanti.

### 2. Firebase (buat login user + database)

1. Buka [Firebase Console](https://console.firebase.google.com) → **Add project** → kasih nama (mis. `slowhead-ai`)
2. Di project itu, buka **Build → Authentication → Get started → Sign-in method** → aktifkan **Email/Password**
3. Buka **Build → Firestore Database → Create database** → mode **production**, pilih region terdekat (mis. `asia-southeast2` Jakarta)
4. Setelah dibuat, buka tab **Rules**, ganti isinya dengan isi file `firestore.rules` yang udah gw sediain (intinya: user boleh baca/tulis riwayat chat miliknya sendiri langsung dari browser buat keperluan sync antar device, tapi data lain kayak counter limit harian tetap dikunci total — cuma server yang boleh akses)
5. Ambil **config client**: klik ikon gerigi → **Project settings** → scroll ke **Your apps** → klik ikon web `</>` → daftarin app → copy object `firebaseConfig` yang muncul
6. Buka `public/index.html`, cari bagian:
   ```js
   const firebaseConfig = {
     apiKey: "GANTI_DENGAN_API_KEY_FIREBASE",
     ...
   };
   ```
   Ganti semua `"GANTI..."` dengan value asli dari langkah 5. (Config ini aman ditaruh di client, bukan rahasia — keamanan diatur lewat Firestore rules + verifikasi token di server, bukan dengan nyembunyiin config ini.)
7. Ambil **service account** (buat backend): masih di **Project settings** → tab **Service accounts** → **Generate new private key** → download file JSON-nya
8. Buka file JSON itu, copy **seluruh isinya jadi satu baris** (bisa pakai `cat servicekey.json | tr -d '\n'` di terminal), nanti dipakai buat env var `FIREBASE_SERVICE_ACCOUNT_JSON`

### 3. Deploy ke Vercel

1. Push folder ini ke repo GitHub baru
2. Buka [vercel.com](https://vercel.com) → **Add New Project** → import repo tadi
3. Sebelum klik Deploy, buka tab **Environment Variables**, isi semua ini (contoh lengkap ada di `.env.example`):

   | Key | Isi |
   |---|---|
   | `GEMINI_API_KEY` | API key Gemini yang **baru** |
   | `FIREBASE_SERVICE_ACCOUNT_JSON` | isi file JSON service account (satu baris) |
   | `ADMIN_USERNAME` | `BeeThere` |
   | `ADMIN_PASSWORD_HASH` | isi persis dari `.env.example` (hash dari "disini") |
   | `SESSION_SECRET` | string acak panjang — generate pakai `openssl rand -hex 32` di terminal |

4. Klik **Deploy**
5. Buka `xxxx.vercel.app` buat chat, dan `xxxx.vercel.app/admin.html` buat dashboard admin

## Ganti password admin

```bash
node scripts/hash-password.js "password_baru_yang_kuat"
```

Copy output-nya, update env var `ADMIN_PASSWORD_HASH` di Vercel (Settings → Environment Variables), lalu redeploy.

## Cara kerja limit 5 pesan/hari

- Setiap user login pakai Firebase Auth (email/password)
- Tiap kirim pesan, `api/chat.js` verifikasi token login, cek counter Firestore hari itu
- Kalau udah 5, request ditolak (`429`) sampai counter reset besok (berdasarkan tanggal UTC)
- Counter ini cuma bisa diubah lewat server (Admin SDK), gak bisa dimanipulasi user dari DevTools

## Riwayat chat — sinkron antar device

Riwayat obrolan disimpan di Firestore (`users/{uid}/chats/{chatId}`), bukan lagi di `localStorage`. Jadi kalau user login di HP dan laptop pakai akun yang sama, riwayat chat-nya sama persis dan update real-time (pakai `onSnapshot`, gak perlu refresh manual).

Ini beda dari counter limit harian (`usage` collection) yang sengaja dikunci cuma-bisa-diakses-server — riwayat chat boleh diakses langsung dari browser karena `firestore.rules` udah ngunci: user cuma bisa baca/tulis chat di path `users/{uid_dia_sendiri}`, gak bisa intip punya user lain.

## Ganti-ganti lain

- **System prompt**: edit `SYSTEM_PROMPT` di `api/chat.js`
- **Model Gemini**: edit `GEMINI_MODEL` di `api/chat.js`
- **Angka limit**: edit `DAILY_LIMIT` di `api/chat.js` dan `api/usage.js`
- **Warna/branding**: `:root { ... }` di bagian atas `public/index.html`
