// Route untuk rekomendasi lagu/playlist berdasarkan mood
const express = require('express');
const { body } = require('express-validator');
const db = require('../db');
const {
  authMiddleware,
  uploadSingle,
  validate,
  removeUploadedFile
} = require('../middleware');

const router = express.Router();

const SONG_NOT_FOUND_MSG = 'Lagu tidak ditemukan';
const BASE_SONG_SELECT = `
  SELECT
    s.id,
    s.title,
    s.artist,
    s.mood_id,
    s.link,
    s.cover_path,
    s.created_by,
    s.created_at,
    m.name AS mood_name,
    m.emoji,
    m.color
  FROM songs s
  JOIN moods m ON s.mood_id = m.id
`;

const selectSongByIdStmt = db.prepare(`${BASE_SONG_SELECT} WHERE s.id = ?`);
const selectRawSongByIdStmt = db.prepare('SELECT * FROM songs WHERE id = ?');

const songValidationRules = [
  body('title').trim().notEmpty().withMessage('Judul lagu wajib diisi'),
  body('artist').trim().notEmpty().withMessage('Nama artis wajib diisi'),
  body('mood_id')
    .notEmpty()
    .withMessage('mood_id wajib diisi')
    .isInt({ min: 1 })
    .withMessage('mood_id harus berupa angka bulat positif')
    .custom((val) => {
      const mood = db.prepare('SELECT id FROM moods WHERE id = ?').get(Number(val));
      if (!mood) {
        throw new Error('Mood tidak ditemukan di database');
      }
      return true;
    }),
  body('link')
    .optional({ values: 'falsy' })
    .trim()
    .isURL({ protocols: ['http', 'https'], require_protocol: true })
    .withMessage('Link lagu harus berupa URL yang valid (http/https)')
];

function resolveUpdatedLink(rawBodyLink, existingLink) {
  if (rawBodyLink === undefined) {
    return existingLink;
  }
  const trimmed = rawBodyLink.trim();
  return trimmed.length > 0 ? trimmed : null;
}

// GET /api/songs (publik) filter ?mood_id=&q=
router.get('/', (req, res) => {
  const { mood_id, q } = req.query;
  const conditions = [];
  const params = [];

  if (mood_id !== undefined && mood_id !== '') {
    conditions.push('s.mood_id = ?');
    params.push(Number(mood_id));
  }

  if (q?.trim()) {
    conditions.push('(s.title LIKE ? OR s.artist LIKE ?)');
    const keyword = `%${q.trim()}%`;
    params.push(keyword, keyword);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const songs = db
    .prepare(`${BASE_SONG_SELECT} ${whereClause} ORDER BY s.id DESC`)
    .all(...params);

  return res.status(200).json({
    success: true,
    data: songs,
    message: 'Daftar lagu berhasil diambil'
  });
});

// GET /api/songs/random?mood_id= (publik) - didaftarkan SEBELUM /:id
router.get('/random', (req, res) => {
  const { mood_id } = req.query;
  let song;

  if (mood_id !== undefined && mood_id !== '') {
    song = db
      .prepare(`${BASE_SONG_SELECT} WHERE s.mood_id = ? ORDER BY RANDOM() LIMIT 1`)
      .get(Number(mood_id));
  } else {
    song = db
      .prepare(`${BASE_SONG_SELECT} ORDER BY RANDOM() LIMIT 1`)
      .get();
  }

  if (!song) {
    return res.status(404).json({
      success: false,
      data: null,
      message: 'Belum ada lagu untuk mood yang dipilih',
      errors: []
    });
  }

  return res.status(200).json({
    success: true,
    data: song,
    message: 'Rekomendasi lagu acak berhasil diambil'
  });
});

// GET /api/songs/:id (publik)
router.get('/:id', (req, res) => {
  const songId = Number(req.params.id);
  const song = selectSongByIdStmt.get(songId);

  if (!song) {
    return res.status(404).json({
      success: false,
      data: null,
      message: SONG_NOT_FOUND_MSG,
      errors: []
    });
  }

  return res.status(200).json({
    success: true,
    data: song,
    message: 'Detail lagu berhasil diambil'
  });
});

// POST /api/songs (auth, multipart field "cover" opsional)
router.post(
  '/',
  authMiddleware,
  uploadSingle('cover'),
  songValidationRules,
  validate,
  (req, res) => {
    const title = req.body.title.trim();
    const artist = req.body.artist.trim();
    const moodId = Number(req.body.mood_id);
    const link = req.body.link ? req.body.link.trim() : null;
    const coverPath = req.file?.filename || null;

    const info = db
      .prepare(`
        INSERT INTO songs (title, artist, mood_id, link, cover_path, created_by)
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      .run(title, artist, moodId, link, coverPath, req.user?.id);

    const createdSong = selectSongByIdStmt.get(Number(info.lastInsertRowid));

    return res.status(201).json({
      success: true,
      data: createdSong,
      message: 'Lagu berhasil ditambahkan'
    });
  }
);

// PUT /api/songs/:id (auth, multipart field "cover" opsional)
router.put(
  '/:id',
  authMiddleware,
  uploadSingle('cover'),
  (req, res, next) => {
    const songId = Number(req.params.id);
    const existing = selectRawSongByIdStmt.get(songId);

    if (!existing) {
      if (req.file?.filename) {
        removeUploadedFile(req.file.filename);
      }
      return res.status(404).json({
        success: false,
        data: null,
        message: SONG_NOT_FOUND_MSG,
        errors: []
      });
    }

    req.existingSong = existing;
    return next();
  },
  songValidationRules,
  validate,
  (req, res) => {
    const existing = req.existingSong;
    const title = req.body.title.trim();
    const artist = req.body.artist.trim();
    const moodId = Number(req.body.mood_id);
    const link = resolveUpdatedLink(req.body.link, existing.link);

    let coverPath = existing.cover_path;
    if (req.file?.filename) {
      if (existing.cover_path) {
        removeUploadedFile(existing.cover_path);
      }
      coverPath = req.file.filename;
    }

    db.prepare(`
      UPDATE songs
      SET title = ?, artist = ?, mood_id = ?, link = ?, cover_path = ?
      WHERE id = ?
    `).run(title, artist, moodId, link, coverPath, existing.id);

    const updatedSong = selectSongByIdStmt.get(existing.id);

    return res.status(200).json({
      success: true,
      data: updatedSong,
      message: 'Lagu berhasil diperbarui'
    });
  }
);

// DELETE /api/songs/:id (auth)
router.delete('/:id', authMiddleware, (req, res) => {
  const songId = Number(req.params.id);
  const existing = selectRawSongByIdStmt.get(songId);

  if (!existing) {
    return res.status(404).json({
      success: false,
      data: null,
      message: SONG_NOT_FOUND_MSG,
      errors: []
    });
  }

  db.prepare('DELETE FROM songs WHERE id = ?').run(songId);

  if (existing.cover_path) {
    removeUploadedFile(existing.cover_path);
  }

  return res.status(200).json({
    success: true,
    data: { id: songId },
    message: 'Lagu berhasil dihapus'
  });
});

module.exports = router;
