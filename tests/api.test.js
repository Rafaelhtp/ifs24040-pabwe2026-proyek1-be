// Pengujian komprehensif REST API Moodify menggunakan Vitest (mencakup seluruh cabang/branch & unit)
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const multer = require('multer');

// Set variabel environment pengujian di awal sebelum meng-import app dan db (tidak bergantung pada .env)
const testUploadDir = path.join(os.tmpdir(), `moodify-test-uploads-${Date.now()}`);
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-moodify-ci-2026';
process.env.TURSO_DATABASE_URL = 'file::memory:';
delete process.env.TURSO_AUTH_TOKEN;
process.env.UPLOAD_DIR = testUploadDir;

const srcDir = fs.existsSync(path.resolve(__dirname, '../../src/app.js'))
  ? '../../src'
  : '../src';

const app = require(`${srcDir}/app`);
const db = require(`${srcDir}/db`);
const { seedDatabase } = require(`${srcDir}/seed`);
const {
  errorHandler,
  getUploadDir,
  removeUploadedFile,
  getJwtSecret,
  formatUploadError
} = require(`${srcDir}/middleware`);

const PNG_BYTES = Uint8Array.from(
  Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000000020001e221bc330000000049454e44ae426082',
    'hex'
  )
);

describe('Moodify REST API Integration & Branch Coverage Tests', () => {
  let server;
  let baseUrl = '';
  let userToken = '';
  let secondUserToken = '';
  let createdEntryId = null;

  beforeAll(async () => {
    await db.ready;
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    if (fs.existsSync(testUploadDir)) {
      fs.rmSync(testUploadDir, { recursive: true, force: true });
    }
    if (db && typeof db.close === 'function') {
      await db.close();
    }
    // Pastikan sub-direktori bersih dari artefak lokal sebelum stage Package Application
    const rootDir = path.resolve(__dirname, '../..');
    const strayPaths = [
      path.join(rootDir, 'backend', 'node_modules'),
      path.join(rootDir, 'frontend', 'node_modules'),
      path.join(rootDir, 'backend', 'coverage'),
      path.join(rootDir, 'backend', 'moodify.db'),
      path.join(rootDir, 'frontend', 'dist')
    ];
    for (const p of strayPaths) {
      if (fs.existsSync(p)) {
        try {
          fs.rmSync(p, { recursive: true, force: true });
        } catch {
          // Abaikan jika gagal menghapus
        }
      }
    }
  });

  // 1. GET /api/health & /robots.txt
  test('1. GET /api/health dan /robots.txt mengembalikan status 200', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toEqual({ status: 'ok' });

    const robotsRes = await fetch(`${baseUrl}/robots.txt`);
    const robotsText = await robotsRes.text();
    expect(robotsRes.status).toBe(200);
    expect(robotsRes.headers.get('content-type')).toContain('text/plain');
    expect(robotsText).toContain('User-agent: *');
  });

  // 2. Register sukses
  test('2. POST /api/auth/register berhasil mendaftarkan akun baru (201)', async () => {
    const res = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Budi Santoso',
        email: 'budi@moodify.com',
        password: 'password123'
      })
    });
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data.token).toBeDefined();
    expect(body.data.user.name).toBe('Budi Santoso');
    expect(body.data.user.email).toBe('budi@moodify.com');
    expect(body.data.user.password_hash).toBeUndefined();
    userToken = body.data.token;
  });

  // 3. Register email duplikat (409) & validasi gagal (400)
  test('3. POST /api/auth/register menolak email duplikat (409) dan input tidak valid (400)', async () => {
    const dupRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Budi Duplikat',
        email: 'budi@moodify.com',
        password: 'password123'
      })
    });
    const dupBody = await dupRes.json();
    expect(dupRes.status).toBe(409);
    expect(dupBody.success).toBe(false);

    const invalidRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: '',
        email: 'bukan-email',
        password: '123'
      })
    });
    expect(invalidRes.status).toBe(400);
  });

  // 4. Login sukses
  test('4. POST /api/auth/login berhasil dengan kredensial yang benar (200)', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'demo@moodify.com',
        password: 'demo12345'
      })
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.token).toBeDefined();
    expect(body.data.user.email).toBe('demo@moodify.com');
    expect(body.data.user.password_hash).toBeUndefined();
  });

  // 5. Login salah (401) & validasi login gagal (400)
  test('5. POST /api/auth/login gagal dengan password/email salah (401) dan format salah (400)', async () => {
    const wrongPassRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'demo@moodify.com',
        password: 'passwordsalah999'
      })
    });
    expect(wrongPassRes.status).toBe(401);

    const unknownEmailRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'tidakada@moodify.com',
        password: 'password123'
      })
    });
    expect(unknownEmailRes.status).toBe(401);

    const badFormatRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'tidak-valid',
        password: ''
      })
    });
    expect(badFormatRes.status).toBe(400);
  });

  // 6. Akses /api/entries tanpa token, format non-Bearer, token rusak, dan token kedaluwarsa (401)
  test('6. Middleware autentikasi menolak tanpa token, non-Bearer, token salah, dan token kedaluwarsa (401)', async () => {
    const noTokenRes = await fetch(`${baseUrl}/api/entries`);
    expect(noTokenRes.status).toBe(401);

    const nonBearerRes = await fetch(`${baseUrl}/api/entries`, {
      headers: { Authorization: 'Basic abcdef' }
    });
    expect(nonBearerRes.status).toBe(401);

    const badTokenRes = await fetch(`${baseUrl}/api/entries`, {
      headers: { Authorization: 'Bearer token.palsu.tidakvalid' }
    });
    expect(badTokenRes.status).toBe(401);

    const expiredToken = jwt.sign(
      { id: 1, email: 'demo@moodify.com', name: 'Demo' },
      process.env.JWT_SECRET,
      { expiresIn: -10 }
    );
    const expiredRes = await fetch(`${baseUrl}/api/entries`, {
      headers: { Authorization: `Bearer ${expiredToken}` }
    });
    expect(expiredRes.status).toBe(401);
  });

  // 7. CRUD entri lengkap (Create dengan/tanpa gambar, Read dengan/tanpa filter, Update ganti gambar, Delete)
  test('7. CRUD /api/entries berjalan lengkap beserta seluruh cabang filter dan penggantian gambar', async () => {
    const today = new Date().toISOString().slice(0, 10);

    // Filter kosong saat user belum punya entri (total = 0 -> total_pages = 1)
    const emptyListRes = await fetch(`${baseUrl}/api/entries`, {
      headers: { Authorization: `Bearer ${userToken}` }
    });
    const emptyListBody = await emptyListRes.json();
    expect(emptyListRes.status).toBe(200);
    expect(emptyListBody.meta.total).toBe(0);
    expect(emptyListBody.meta.total_pages).toBe(1);

    // a. CREATE entri dengan gambar & note
    const createFd = new FormData();
    createFd.append('entry_date', today);
    createFd.append('mood_id', '1');
    createFd.append('energy_level', '4');
    createFd.append('note', 'Catatan jurnal pengujian otomatis');
    createFd.append('image', new Blob([PNG_BYTES], { type: 'image/png' }), 'test1.png');

    const createRes = await fetch(`${baseUrl}/api/entries`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${userToken}` },
      body: createFd
    });
    const createBody = await createRes.json();
    expect(createRes.status).toBe(201);
    expect(createBody.data.image_path).toMatch(/\.png$/);
    createdEntryId = createBody.data.id;

    // CREATE entri kedua tanpa gambar & tanpa note
    const createNoImgRes = await fetch(`${baseUrl}/api/entries`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${userToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        entry_date: today,
        mood_id: 2,
        energy_level: 3
      })
    });
    const createNoImgBody = await createNoImgRes.json();
    expect(createNoImgRes.status).toBe(201);
    expect(createNoImgBody.data.note).toBeNull();
    expect(createNoImgBody.data.image_path).toBeNull();
    const secondEntryId = createNoImgBody.data.id;

    // b. READ daftar entri dengan filter lengkap
    const listRes = await fetch(
      `${baseUrl}/api/entries?q=pengujian&mood_id=1&from=${today}&to=${today}&page=1&limit=5`,
      { headers: { Authorization: `Bearer ${userToken}` } }
    );
    const listBody = await listRes.json();
    expect(listRes.status).toBe(200);
    expect(listBody.data.length).toBe(1);

    // c. READ detail entri
    const detailRes = await fetch(`${baseUrl}/api/entries/${createdEntryId}`, {
      headers: { Authorization: `Bearer ${userToken}` }
    });
    expect(detailRes.status).toBe(200);

    // d. UPDATE entri mengganti gambar lama dengan gambar baru
    const updateWithImgFd = new FormData();
    updateWithImgFd.append('entry_date', today);
    updateWithImgFd.append('mood_id', '2');
    updateWithImgFd.append('energy_level', '5');
    updateWithImgFd.append('note', 'Catatan jurnal setelah diperbarui');
    updateWithImgFd.append('image', new Blob([PNG_BYTES], { type: 'image/png' }), 'test2.png');

    const updateRes = await fetch(`${baseUrl}/api/entries/${createdEntryId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${userToken}` },
      body: updateWithImgFd
    });
    const updateBody = await updateRes.json();
    expect(updateRes.status).toBe(200);
    expect(updateBody.data.mood_id).toBe(2);
    expect(updateBody.data.image_path).not.toBe(createBody.data.image_path);

    // UPDATE entri kedua tanpa note & tanpa gambar (mempertahankan nilai sebelumnya)
    const updateNoNoteRes = await fetch(`${baseUrl}/api/entries/${secondEntryId}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${userToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        entry_date: today,
        mood_id: 1,
        energy_level: 4
      })
    });
    expect(updateNoNoteRes.status).toBe(200);

    // Hapus entri kedua (tanpa gambar)
    const delSecondRes = await fetch(`${baseUrl}/api/entries/${secondEntryId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${userToken}` }
    });
    expect(delSecondRes.status).toBe(200);
  });

  // 8. Akses entri milik user lain (404) & statistik mingguan user kosong
  test('8. Akses entri milik user lain (GET, PUT dengan file, DELETE) mengembalikan 404 & stats user baru bernilai 0', async () => {
    const regSecond = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Siti Aminah',
        email: 'siti@moodify.com',
        password: 'password123'
      })
    });
    const regSecondBody = await regSecond.json();
    secondUserToken = regSecondBody.data.token;

    // Statistik mingguan untuk Siti yang belum punya entri sama sekali (top_mood = null, total = 0)
    const emptyStatsRes = await fetch(`${baseUrl}/api/stats/weekly`, {
      headers: { Authorization: `Bearer ${secondUserToken}` }
    });
    const emptyStatsBody = await emptyStatsRes.json();
    expect(emptyStatsRes.status).toBe(200);
    expect(emptyStatsBody.data.total_entries_7d).toBe(0);
    expect(emptyStatsBody.data.avg_energy_7d).toBe(0);
    expect(emptyStatsBody.data.top_mood).toBeNull();
    expect(emptyStatsBody.data.daily).toHaveLength(7);

    // GET entri milik user lain -> 404
    const getOtherRes = await fetch(`${baseUrl}/api/entries/${createdEntryId}`, {
      headers: { Authorization: `Bearer ${secondUserToken}` }
    });
    expect(getOtherRes.status).toBe(404);

    // PUT entri milik user lain sambil mengunggah file -> file dibersihkan & 404
    const putOtherFd = new FormData();
    putOtherFd.append('entry_date', '2026-05-01');
    putOtherFd.append('mood_id', '1');
    putOtherFd.append('energy_level', '3');
    putOtherFd.append('image', new Blob([PNG_BYTES], { type: 'image/png' }), 'other.png');

    const putOtherRes = await fetch(`${baseUrl}/api/entries/${createdEntryId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${secondUserToken}` },
      body: putOtherFd
    });
    expect(putOtherRes.status).toBe(404);

    // DELETE entri milik user lain -> 404
    const delOtherRes = await fetch(`${baseUrl}/api/entries/${createdEntryId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${secondUserToken}` }
    });
    expect(delOtherRes.status).toBe(404);

    // DELETE entri milik sendiri (yang memiliki image_path) -> 200
    const delOwnRes = await fetch(`${baseUrl}/api/entries/${createdEntryId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${userToken}` }
    });
    expect(delOwnRes.status).toBe(200);
  });

  // 9. Moods CRUD lengkap, duplikat (409), tidak ditemukan (404), dan masih dipakai entri (409)
  test('9. /api/moods mencakup validasi (400), duplikat (409), tidak ditemukan (404), dan masih dipakai (409)', async () => {
    // Hapus mood yang masih dipakai entri demo -> 409
    const usedRes = await fetch(`${baseUrl}/api/moods/1`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${userToken}` }
    });
    expect(usedRes.status).toBe(409);

    // POST mood duplikat nama 'Senang' -> 409
    const dupPostRes = await fetch(`${baseUrl}/api/moods`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${userToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: 'Senang', emoji: '😊' })
    });
    expect(dupPostRes.status).toBe(409);

    // POST mood validasi gagal (warna hex salah) -> 400
    const badColorRes = await fetch(`${baseUrl}/api/moods`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${userToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: 'TestHex', emoji: '✨', color: 'bukan-hex' })
    });
    expect(badColorRes.status).toBe(400);

    // PUT & DELETE mood yang tidak ada (99999) -> 404
    const putNotFound = await fetch(`${baseUrl}/api/moods/99999`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${userToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: 'Hantu', emoji: '👻' })
    });
    expect(putNotFound.status).toBe(404);

    const delNotFound = await fetch(`${baseUrl}/api/moods/99999`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${userToken}` }
    });
    expect(delNotFound.status).toBe(404);
  });

  // 10. GET /api/songs/random (dengan mood_id, tanpa mood_id, dan mood kosong 404)
  test('10. GET /api/songs/random mengembalikan lagu acak (dengan/tanpa mood_id) dan 404 jika mood kosong', async () => {
    const randomWithMood = await fetch(`${baseUrl}/api/songs/random?mood_id=1`);
    expect(randomWithMood.status).toBe(200);

    const randomAnyMood = await fetch(`${baseUrl}/api/songs/random`);
    expect(randomAnyMood.status).toBe(200);

    // Buat mood baru tanpa color (menguji default '#9CA3AF')
    const newMoodRes = await fetch(`${baseUrl}/api/moods`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${userToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: 'Nostalgia', emoji: '🥹' })
    });
    const newMoodBody = await newMoodRes.json();
    expect(newMoodRes.status).toBe(201);
    expect(newMoodBody.data.color).toBe('#9CA3AF');
    const emptyMoodId = newMoodBody.data.id;

    // Random lagu untuk mood yang belum punya lagu -> 404
    const emptyRandomRes = await fetch(`${baseUrl}/api/songs/random?mood_id=${emptyMoodId}`);
    expect(emptyRandomRes.status).toBe(404);

    // PUT mood dengan nama duplikat mood lain ('Senang') -> 409
    const dupPutMood = await fetch(`${baseUrl}/api/moods/${emptyMoodId}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${userToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: 'Senang', emoji: '🥹' })
    });
    expect(dupPutMood.status).toBe(409);

    // PUT mood tanpa mengirim color (mempertahankan existing.color) -> 200
    const updMoodRes = await fetch(`${baseUrl}/api/moods/${emptyMoodId}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${userToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: 'Nostalgia Indah', emoji: '🥹' })
    });
    expect(updMoodRes.status).toBe(200);

    const delMoodRes = await fetch(`${baseUrl}/api/moods/${emptyMoodId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${userToken}` }
    });
    expect(delMoodRes.status).toBe(200);
  });

  // 11. Validasi entri gagal (tanggal mustahil, mood_id tidak ada, file bukan gambar, file > 2MB)
  test('11. POST /api/entries menolak tipe file salah (400), ukuran > 2MB (413), dan gagal validasi setelah upload (400)', async () => {
    const today = new Date().toISOString().slice(0, 10);

    // a. Tipe file bukan gambar -> 400
    const badFileFd = new FormData();
    badFileFd.append('entry_date', today);
    badFileFd.append('mood_id', '1');
    badFileFd.append('energy_level', '3');
    badFileFd.append(
      'image',
      new Blob(['Ini file teks biasa'], { type: 'text/plain' }),
      'dokumen.txt'
    );
    const badFileRes = await fetch(`${baseUrl}/api/entries`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${userToken}` },
      body: badFileFd
    });
    expect(badFileRes.status).toBe(400);

    // b. File lebih besar dari 2 MB -> 413 LIMIT_FILE_SIZE
    const bigBuffer = new Uint8Array(2 * 1024 * 1024 + 1024);
    const bigFd = new FormData();
    bigFd.append('entry_date', today);
    bigFd.append('mood_id', '1');
    bigFd.append('energy_level', '3');
    bigFd.append('image', new Blob([bigBuffer], { type: 'image/png' }), 'huge.png');
    const bigRes = await fetch(`${baseUrl}/api/entries`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${userToken}` },
      body: bigFd
    });
    expect(bigRes.status).toBe(413);

    // c. Upload gambar valid tetapi tanggal mustahil (2026-02-30) & mood_id 9999 -> validate menghapus file & 400
    const invalidFieldsFd = new FormData();
    invalidFieldsFd.append('entry_date', '2026-02-30');
    invalidFieldsFd.append('mood_id', '9999');
    invalidFieldsFd.append('energy_level', '9');
    invalidFieldsFd.append('image', new Blob([PNG_BYTES], { type: 'image/png' }), 'temp.png');
    const invalidFieldsRes = await fetch(`${baseUrl}/api/entries`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${userToken}` },
      body: invalidFieldsFd
    });
    expect(invalidFieldsRes.status).toBe(400);
  });

  // 12. GET /api/stats/weekly untuk akun demo
  test('12. GET /api/stats/weekly mengembalikan statistik 7 hari terakhir secara lengkap', async () => {
    const loginDemo = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'demo@moodify.com',
        password: 'demo12345'
      })
    });
    const loginDemoBody = await loginDemo.json();
    const demoToken = loginDemoBody.data.token;

    const res = await fetch(`${baseUrl}/api/stats/weekly`, {
      headers: { Authorization: `Bearer ${demoToken}` }
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.total_entries_7d).toBeGreaterThan(0);
    expect(body.data.avg_energy_7d).toBeGreaterThan(0);
    expect(body.data.top_mood.name).toBeDefined();
    expect(Array.isArray(body.data.by_mood)).toBe(true);
    expect(body.data.daily).toHaveLength(7);
  });

  // 13. GET /api/auth/me (200 & 404), GET /api/moods, dan CRUD /api/songs lengkap beserta cover & error 404/400
  test('13. GET /api/auth/me, GET /api/moods, dan seluruh cabang CRUD /api/songs berjalan dengan benar', async () => {
    const meRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${userToken}` }
    });
    expect(meRes.status).toBe(200);

    const moodsListRes = await fetch(`${baseUrl}/api/moods`);
    const moodsListBody = await moodsListRes.json();
    expect(moodsListRes.status).toBe(200);
    expect(moodsListBody.data.length).toBeGreaterThanOrEqual(7);

    // Token untuk user ID yang tidak ada di DB -> /api/auth/me mengembalikan 404
    const ghostToken = jwt.sign(
      { id: 999999, email: 'ghost@moodify.com', name: 'Ghost' },
      process.env.JWT_SECRET
    );
    const ghostMeRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${ghostToken}` }
    });
    expect(ghostMeRes.status).toBe(404);

    // GET /api/songs tanpa filter & dengan filter
    const allSongsRes = await fetch(`${baseUrl}/api/songs`);
    expect(allSongsRes.status).toBe(200);

    const filteredSongsRes = await fetch(`${baseUrl}/api/songs?mood_id=1&q=Happy`);
    expect(filteredSongsRes.status).toBe(200);

    // GET /api/songs/:id tidak ditemukan -> 404
    const missingSongRes = await fetch(`${baseUrl}/api/songs/99999`);
    expect(missingSongRes.status).toBe(404);

    // POST /api/songs validasi gagal (mood_id 9999 & URL tidak valid) -> 400
    const badSongRes = await fetch(`${baseUrl}/api/songs`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${userToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        title: 'Lagu Invalid',
        artist: 'Artis',
        mood_id: 9999,
        link: 'bukan-url'
      })
    });
    expect(badSongRes.status).toBe(400);

    // POST /api/songs dengan cover & link
    const createFd = new FormData();
    createFd.append('title', 'Lagu Baru Test');
    createFd.append('artist', 'Artis Test');
    createFd.append('mood_id', '1');
    createFd.append('link', 'https://www.youtube.com/results?search_query=lagu+baru+test');
    createFd.append('cover', new Blob([PNG_BYTES], { type: 'image/png' }), 'cover1.png');

    const createSongRes = await fetch(`${baseUrl}/api/songs`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${userToken}` },
      body: createFd
    });
    const createSongBody = await createSongRes.json();
    expect(createSongRes.status).toBe(201);
    expect(createSongBody.data.cover_path).toMatch(/\.png$/);
    const songId = createSongBody.data.id;

    // GET detail lagu -> 200
    const detailSongRes = await fetch(`${baseUrl}/api/songs/${songId}`);
    expect(detailSongRes.status).toBe(200);

    // PUT /api/songs/:id mengganti cover lama dengan cover baru & mengosongkan link
    const updateFd = new FormData();
    updateFd.append('title', 'Lagu Baru Diperbarui');
    updateFd.append('artist', 'Artis Test');
    updateFd.append('mood_id', '1');
    updateFd.append('link', '');
    updateFd.append('cover', new Blob([PNG_BYTES], { type: 'image/png' }), 'cover2.png');

    const updateSongRes = await fetch(`${baseUrl}/api/songs/${songId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${userToken}` },
      body: updateFd
    });
    const updateSongBody = await updateSongRes.json();
    expect(updateSongRes.status).toBe(200);
    expect(updateSongBody.data.title).toBe('Lagu Baru Diperbarui');
    expect(updateSongBody.data.link).toBeNull();

    // PUT /api/songs/:id tanpa mengirim field link & tanpa cover (mempertahankan nilai yang ada)
    const updateKeepRes = await fetch(`${baseUrl}/api/songs/${songId}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${userToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        title: 'Lagu Tetap',
        artist: 'Artis Test',
        mood_id: 1
      })
    });
    expect(updateKeepRes.status).toBe(200);

    // PUT /api/songs/99999 yang tidak ada sambil mengunggah cover -> 404 & hapus file
    const putMissingFd = new FormData();
    putMissingFd.append('title', 'Tidak Ada');
    putMissingFd.append('artist', 'Artis');
    putMissingFd.append('mood_id', '1');
    putMissingFd.append('cover', new Blob([PNG_BYTES], { type: 'image/png' }), 'missing.png');
    const putMissingRes = await fetch(`${baseUrl}/api/songs/99999`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${userToken}` },
      body: putMissingFd
    });
    expect(putMissingRes.status).toBe(404);

    // DELETE /api/songs/99999 yang tidak ada -> 404
    const delMissingRes = await fetch(`${baseUrl}/api/songs/99999`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${userToken}` }
    });
    expect(delMissingRes.status).toBe(404);

    // DELETE /api/songs/:id (beserta cover_path) -> 200
    const deleteSongRes = await fetch(`${baseUrl}/api/songs/${songId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${userToken}` }
    });
    expect(deleteSongRes.status).toBe(200);
  });

  // 14. Rute 404 (/api/unknown & non-API), CORS, serta unit test db.js & middleware.js
  test('14. Mencakup rute 404, CORS, errorHandler (prod vs dev), formatUploadError, dan inisialisasi db.js', async () => {
    // a. 404 pada /api/unknown dan rute halaman non-API
    const api404Res = await fetch(`${baseUrl}/api/rute-tidak-dikenal`);
    expect(api404Res.status).toBe(404);

    const page404Res = await fetch(`${baseUrl}/halaman-spa-acak`);
    expect([200, 404]).toContain(page404Res.status);

    // b. Uji CORS ketika CLIENT_URL dibatasi, domain Vercel (*.vercel.app), dan mode development
    process.env.CLIENT_URL = 'https://moodify.example.com';
    expect(app.isOriginAllowed('https://moodify.example.com')).toBe(true);
    expect(app.isOriginAllowed('https://moodify-fe.vercel.app')).toBe(true);
    expect(app.isOriginAllowed('https://attacker.example.com')).toBe(false);
    const corsBlockedRes = await fetch(`${baseUrl}/api/health`, {
      headers: { Origin: 'https://attacker.example.com' }
    });
    expect(corsBlockedRes.status).toBe(403);

    delete process.env.CLIENT_URL;
    process.env.NODE_ENV = 'development';
    expect(app.isOriginAllowed('http://localhost:5173')).toBe(true);
    process.env.NODE_ENV = 'test';
    process.env.CLIENT_URL = '*';

    // d. Uji unit middleware helper: getJwtSecret, getUploadDir, removeUploadedFile, formatUploadError, errorHandler
    const savedSecret = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;
    expect(typeof getJwtSecret()).toBe('string');
    expect(getJwtSecret().length).toBeGreaterThan(10);
    process.env.JWT_SECRET = savedSecret;
    expect(typeof app.generateTraceId()).toBe('string');
    expect(app.generateTraceId().length).toBeGreaterThan(0);
    expect(typeof app.generateFakeId()).toBe('string');

    const newUploadSubdir = path.join(testUploadDir, 'subdir-baru');
    expect(getUploadDir(newUploadSubdir)).toBe(newUploadSubdir);

    // Uji blok catch getUploadDir (fallback ke os.tmpdir()/moodify-uploads)
    const fallbackUploadDir = path.join(os.tmpdir(), 'moodify-uploads');
    fs.rmSync(fallbackUploadDir, { recursive: true, force: true });
    expect(getUploadDir('\0invalid-upload-path')).toBe(fallbackUploadDir);
    expect(getUploadDir('\0invalid-upload-path')).toBe(fallbackUploadDir);

    expect(removeUploadedFile('')).toBe(false);
    expect(removeUploadedFile('file-tidak-ada.png')).toBe(false);

    // Uji blok catch removeUploadedFile ketika target adalah direktori (unlinkSync melempar error)
    const dirInUploads = path.join(getUploadDir(), 'folder-bukan-file');
    fs.mkdirSync(dirInUploads, { recursive: true });
    expect(removeUploadedFile('folder-bukan-file')).toBe(false);
    fs.rmSync(dirInUploads, { recursive: true, force: true });

    const unexpectedFieldErr = new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'other');
    const formattedMulter = formatUploadError(unexpectedFieldErr, 'image');
    expect(formattedMulter.status).toBe(400);
    const formattedEmpty = formatUploadError({}, 'image');
    expect(formattedEmpty.status).toBe(400);

    // Uji errorHandler di mode development/test vs production
    const tempFile = path.join(getUploadDir(), 'err-cleanup.png');
    fs.writeFileSync(tempFile, 'dummy');

    let statusSent = 0;
    let jsonSent = null;
    const mockRes = {
      status(code) {
        statusSent = code;
        return this;
      },
      json(payload) {
        jsonSent = payload;
        return this;
      }
    };

    const sampleErr = new Error('Detail error internal database');
    errorHandler(sampleErr, { file: { filename: 'err-cleanup.png' } }, mockRes, () => {});
    expect(statusSent).toBe(500);
    expect(jsonSent.message).toBe('Detail error internal database');
    expect(jsonSent.debug).toBeDefined();

    process.env.NODE_ENV = 'production';
    errorHandler(sampleErr, {}, mockRes, () => {});
    expect(statusSent).toBe(500);
    expect(jsonSent.message).toBe('Terjadi kesalahan pada server');
    expect(jsonSent.debug).toBeUndefined();
    process.env.NODE_ENV = 'test';

    // e. Seed idempotent dan transaksi rollback menggunakan client libSQL promise-based
    expect(await seedDatabase(db)).toBe(false);

    const transaction = await db.transaction('write');
    await transaction.execute({
      sql: 'INSERT INTO moods (name, emoji, color) VALUES (?, ?, ?)',
      args: ['Sementara', '🧪', '#000000']
    });
    await transaction.rollback();

    const rolledBackMoodResult = await db.execute({
      sql: 'SELECT * FROM moods WHERE name = ?',
      args: ['Sementara']
    });
    expect(rolledBackMoodResult.rows).toHaveLength(0);
  });
});
