# Moodify Backend API (Bun & `bun:sqlite`)

**Moodify Backend** adalah layanan REST API mandiri untuk aplikasi jurnal mood harian **Moodify**. Layanan ini menggunakan **Express.js** dan modul SQLite bawaan **Bun (`bun:sqlite`)** tanpa ketergantungan *native C++ addon* (`better-sqlite3`), sehingga dapat berjalan langsung di atas container `oven/bun:alpine` maupun di lingkungan lokal lintas sistem operasi.

---

## 1. Tech Stack

- **Runtime & Package Manager**: **Bun** (bagian dari Bun Workspaces di root repo)
- **Framework Web**: Express.js
- **Database**: SQLite (`bun:sqlite` dengan *prepared statements* & transaksi seed otomatis)
- **Autentikasi & Keamanan**: JWT (`jsonwebtoken`) & `bcryptjs`
- **Validasi & Upload**: `express-validator`, `multer` v2, `uuid`
- **Testing**: `bun test` (`bun:test`) & Vitest (`lcov` coverage)

---

## 2. Cara Menjalankan dari Root Repositori

```bash
# 1. Instal seluruh dependensi workspace dari root repo
bun install

# 2. Salin konfigurasi environment
copy .env.example .env   # Windows
cp .env.example .env     # macOS / Linux

# 3. Jalankan server backend (http://localhost:5000)
bun run start

# 4. Jalankan pengujian otomatis dengan coverage lcov
bun test --coverage --coverage-reporter=lcov
```

---

## 3. Akun Demo

| Field | Nilai |
| :--- | :--- |
| **Email** | `demo@moodify.com` |
| **Password** | `demo12345` |
