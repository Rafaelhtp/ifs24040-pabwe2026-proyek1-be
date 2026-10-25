# Moodify Backend API (Express & Turso/libSQL)

**Moodify Backend** adalah layanan REST API untuk aplikasi jurnal mood harian **Moodify**. Backend menggunakan **Express.js** dan client promise-based **`@libsql/client`** untuk terhubung ke database Turso/libSQL.

## 1. Tech Stack

- **Runtime**: Node.js 22+ atau Bun
- **Framework Web**: Express.js
- **Database**: Turso/libSQL melalui `@libsql/client` (query async/await dan seed transaksional)
- **Autentikasi**: JWT (`jsonwebtoken`) dan `bcryptjs`
- **Validasi & Upload**: `express-validator`, `multer` v2, `uuid`
- **Testing**: Vitest

## 2. Konfigurasi database

Atur URL database Turso dan token autentikasi di file `.env`:

```env
TURSO_DATABASE_URL=libsql://your-database-name-your-org.turso.io
TURSO_AUTH_TOKEN=your-turso-auth-token
```

Salin `.env.example` sebagai template. `TURSO_DATABASE_URL` wajib tersedia; backend akan berhenti saat inisialisasi jika belum diatur. Skema tabel dan data demo dibuat otomatis setelah koneksi berhasil.

Untuk pengujian lokal tanpa Turso, API test menggunakan URL libSQL `file::memory:`.

## 3. Menjalankan backend

```bash
# Salin konfigurasi environment
copy .env.example .env   # Windows
cp .env.example .env     # macOS / Linux

# Instal dependensi dan jalankan server
npm install
npm run start:node
```

Server berjalan di `http://localhost:5000`. Tes bisa dijalankan dengan:

```bash
npm test
```

## 4. Akun Demo

| Field | Nilai |
| :--- | :--- |
| **Email** | `demo@moodify.com` |
| **Password** | `demo12345` |
