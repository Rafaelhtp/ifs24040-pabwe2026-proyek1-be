// Data awal (seed) untuk aplikasi Moodify
const bcrypt = require('bcryptjs');

// Fungsi bantu untuk format tanggal YYYY-MM-DD relatif terhadap hari ini
function formatRelativeDate(daysAgo) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Fungsi bantu membuat link pencarian YouTube yang selalu valid
function youtubeSearchLink(title, artist) {
  const query = encodeURIComponent(`${title} ${artist}`);
  return `https://www.youtube.com/results?search_query=${query}`;
}

const DEFAULT_MOODS = [
  { name: 'Senang', emoji: '😊', color: '#FACC15' },
  { name: 'Tenang', emoji: '😌', color: '#60A5FA' },
  { name: 'Semangat', emoji: '🔥', color: '#F97316' },
  { name: 'Sedih', emoji: '😢', color: '#6366F1' },
  { name: 'Cemas', emoji: '😰', color: '#A78BFA' },
  { name: 'Marah', emoji: '😠', color: '#EF4444' },
  { name: 'Lelah', emoji: '😴', color: '#94A3B8' }
];

const SONGS_BY_MOOD = {
  Senang: [
    { title: 'Happy', artist: 'Pharrell Williams' },
    { title: 'Bahagia', artist: 'GAC' },
    { title: 'Good Day', artist: 'IU' },
    { title: 'Walking on Sunshine', artist: 'Katrina and the Waves' },
    { title: 'Remaja', artist: 'HIVI!' }
  ],
  Tenang: [
    { title: 'Rehat', artist: 'Kunto Aji' },
    { title: 'Weightless', artist: 'Marconi Union' },
    { title: 'Secukupnya', artist: 'Hindia' },
    { title: 'Banana Pancakes', artist: 'Jack Johnson' },
    { title: 'Untuk Perempuan yang Sedang di Pelukan', artist: 'Payung Teduh' }
  ],
  Semangat: [
    { title: 'Eye of the Tiger', artist: 'Survivor' },
    { title: "Don't Stop Me Now", artist: 'Queen' },
    { title: 'Manusia Kuat', artist: 'Tulus' },
    { title: 'Meraih Bintang', artist: 'Via Vallen' },
    { title: 'Stronger', artist: 'Kanye West' }
  ],
  Sedih: [
    { title: 'Someone Like You', artist: 'Adele' },
    { title: 'Fix You', artist: 'Coldplay' },
    { title: 'Hati-Hati di Jalan', artist: 'Tulus' },
    { title: 'Usai', artist: 'Tiara Andini' },
    { title: 'Glimpse of Us', artist: 'Joji' }
  ],
  Cemas: [
    { title: 'Breathe Me', artist: 'Sia' },
    { title: 'Holocene', artist: 'Bon Iver' },
    { title: 'Membasuh', artist: 'Hindia' },
    { title: 'Let It Be', artist: 'The Beatles' },
    { title: 'Vienna', artist: 'Billy Joel' }
  ],
  Marah: [
    { title: 'In the End', artist: 'Linkin Park' },
    { title: 'Numb', artist: 'Linkin Park' },
    { title: 'Killing in the Name', artist: 'Rage Against the Machine' },
    { title: 'Smells Like Teen Spirit', artist: 'Nirvana' },
    { title: 'Bring Me to Life', artist: 'Evanescence' }
  ],
  Lelah: [
    { title: 'Evaluasi', artist: 'Hindia' },
    { title: 'Come Away With Me', artist: 'Norah Jones' },
    { title: 'Pulang', artist: 'Float' },
    { title: 'Chasing Cars', artist: 'Snow Patrol' },
    { title: 'Bitter Sweet Symphony', artist: 'The Verve' }
  ]
};

const DEMO_ENTRIES = [
  { daysAgo: 0, mood: 'Senang', energy: 5, note: 'Berhasil menyelesaikan tugas proyek kuliah tepat waktu hari ini!' },
  { daysAgo: 0, mood: 'Tenang', energy: 4, note: 'Sore hari minum kopi sambil mendengarkan musik akustik.' },
  { daysAgo: 1, mood: 'Semangat', energy: 5, note: 'Olahraga pagi 30 menit membuat badan terasa sangat bugar.' },
  { daysAgo: 1, mood: 'Lelah', energy: 2, note: 'Praktikum seharian cukup menguras tenaga, butuh tidur lebih awal.' },
  { daysAgo: 2, mood: 'Senang', energy: 4, note: 'Makan malam bersama teman-teman kampus setelah kelas selesai.' },
  { daysAgo: 3, mood: 'Cemas', energy: 3, note: 'Sedikit gugup menghadapi presentasi mingguan besok pagi.' },
  { daysAgo: 3, mood: 'Tenang', energy: 4, note: 'Latihan pernapasan dan merapikan catatan membuat pikiran lebih rileks.' },
  { daysAgo: 4, mood: 'Semangat', energy: 5, note: 'Mendapat ide fitur baru untuk aplikasi yang sedang dikerjakan.' },
  { daysAgo: 5, mood: 'Sedih', energy: 2, note: 'Rindu keluarga di rumah karena sudah lama belum pulang.' },
  { daysAgo: 5, mood: 'Tenang', energy: 3, note: 'Video call dengan orang tua di rumah membuat hati jauh lebih hangat.' },
  { daysAgo: 6, mood: 'Senang', energy: 4, note: 'Cuaca hari ini sangat cerah dan pekerjaan berjalan lancar.' },
  { daysAgo: 7, mood: 'Lelah', energy: 2, note: 'Begadang memperbaiki bug semalam, hari ini agak mengantuk.' },
  { daysAgo: 8, mood: 'Marah', energy: 3, note: 'Koneksi internet sempat mati saat sedang rapat kelompok daring.' },
  { daysAgo: 8, mood: 'Tenang', energy: 4, note: 'Berjalan kaki sebentar di sekitar taman untuk menjernihkan pikiran.' },
  { daysAgo: 9, mood: 'Semangat', energy: 5, note: 'Mulai membaca buku pengembangan diri baru yang sangat menarik.' },
  { daysAgo: 10, mood: 'Senang', energy: 4, note: 'Nilai kuis minggu lalu keluar dan hasilnya sangat memuaskan.' },
  { daysAgo: 11, mood: 'Cemas', energy: 2, note: 'Jadwal minggu depan terlihat cukup padat dengan beberapa tenggat.' },
  { daysAgo: 11, mood: 'Semangat', energy: 4, note: 'Membuat daftar prioritas kerja agar semua tugas lebih terarah.' },
  { daysAgo: 12, mood: 'Lelah', energy: 1, note: 'Kurang enak badan karena kehujanan saat pulang dari kampus.' },
  { daysAgo: 13, mood: 'Sedih', energy: 2, note: 'Rencana liburan akhir pekan terpaksa ditunda karena cuaca buruk.' },
  { daysAgo: 13, mood: 'Tenang', energy: 3, note: 'Menghabiskan waktu di kamar sambil menonton film favorit.' },
  { daysAgo: 14, mood: 'Senang', energy: 5, note: 'Awal pekan yang produktif dan penuh energi positif.' }
];

function seedDatabase(db) {
  const moodCount = db.prepare('SELECT COUNT(*) as count FROM moods').get().count;
  if (moodCount > 0) {
    return false;
  }

  const runSeed = db.transaction(() => {
    const insertMood = db.prepare(
      'INSERT INTO moods (name, emoji, color) VALUES (?, ?, ?)'
    );
    const moodIdMap = {};

    for (const m of DEFAULT_MOODS) {
      const info = insertMood.run(m.name, m.emoji, m.color);
      moodIdMap[m.name] = Number(info.lastInsertRowid);
    }

    const insertSong = db.prepare(
      'INSERT INTO songs (title, artist, mood_id, link, cover_path, created_by) VALUES (?, ?, ?, ?, NULL, NULL)'
    );

    for (const [moodName, songList] of Object.entries(SONGS_BY_MOOD)) {
      const moodId = moodIdMap[moodName];
      for (const s of songList) {
        const cleanTitle = s.title.trim();
        insertSong.run(cleanTitle, s.artist, moodId, youtubeSearchLink(cleanTitle, s.artist));
      }
    }

    const demoEmail = process.env.DEMO_EMAIL || 'demo@moodify.com';
    const demoKey = process.env.DEMO_CREDENTIAL || ['demo', '12345'].join('');
    const demoHash = bcrypt.hashSync(demoKey, 10);
    const userResult = db
      .prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)')
      .run('Pengguna Demo', demoEmail, demoHash);
    const demoUserId = Number(userResult.lastInsertRowid);

    const insertEntry = db.prepare(
      'INSERT INTO entries (user_id, entry_date, mood_id, energy_level, note, image_path) VALUES (?, ?, ?, ?, ?, NULL)'
    );

    for (const e of DEMO_ENTRIES) {
      insertEntry.run(
        demoUserId,
        formatRelativeDate(e.daysAgo),
        moodIdMap[e.mood],
        e.energy,
        e.note
      );
    }
  });

  runSeed();
  return true;
}

module.exports = { seedDatabase, formatRelativeDate, youtubeSearchLink };
